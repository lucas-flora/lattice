/**
 * Terminal state management hook.
 *
 * Manages output log, command history, input state, and ghost-text autocomplete.
 * Subscribes to EventBus for curated log entries.
 *
 * Phase 8: Non-command input routes to AI assistant instead of placeholder.
 */

'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { commandRegistry } from '@/commands/CommandRegistry';
import { eventBus } from '@/engine/core/EventBus';
import { parseCommand, isCommand, getGhostText, getCycleCandidates, learningModel } from './commandParser';
import { aiService } from '@/ai/aiService';
import { formatCommandResult } from './formatCommandResult';

export type LogEntryType = 'command' | 'info' | 'error' | 'ai';

export type StructuredData =
  | { kind: 'code'; language: string; content: string }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'kv'; pairs: [string, string][] }
  | { kind: 'json'; content: unknown };

export interface LogEntry {
  id: number;
  type: LogEntryType;
  message: string;
  timestamp: Date;
  data?: StructuredData;
}

const MAX_SCROLLBACK = 500;

let nextId = 0;

export function useTerminal() {
  const [output, setOutput] = useState<LogEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [ghostText, setGhostText] = useState('');
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const cycleRef = useRef<{ baseInput: string; candidates: string[]; index: number } | null>(null);

  const addLogEntry = useCallback((type: LogEntryType, message: string, data?: StructuredData) => {
    setOutput((prev) => {
      const entry: LogEntry = {
        id: nextId++,
        type,
        message,
        timestamp: new Date(),
        data,
      };
      const next = [...prev, entry];
      if (next.length > MAX_SCROLLBACK) {
        return next.slice(next.length - MAX_SCROLLBACK);
      }
      return next;
    });
  }, []);

  // Subscribe to curated EventBus events for log output
  useEffect(() => {
    const onPlay = () => addLogEntry('info', 'Simulation started');
    const onPause = () => addLogEntry('info', 'Simulation paused');
    const onReset = () => addLogEntry('info', 'Simulation reset');
    const onPresetLoaded = (payload: { name: string }) => addLogEntry('info', `Preset loaded: ${payload.name}`);
    const onClear = () => addLogEntry('info', 'Grid cleared');
    const onSpeedChange = (payload: { fps: number }) => addLogEntry('info', `Speed set to ${payload.fps === 0 ? 'max' : payload.fps + ' FPS'}`);
    const onParamChanged = (payload: { name: string; value: number }) => addLogEntry('info', `${payload.name} = ${payload.value}`);

    // Bench progress: replace the last entry if it's also a progress line (avoids flooding)
    const BENCH_PREFIX = '\u200B'; // zero-width space marks bench progress entries
    const onBenchProgress = (payload: { message: string }) => {
      setOutput((prev) => {
        const msg = BENCH_PREFIX + payload.message;
        const last = prev.length > 0 ? prev[prev.length - 1] : null;
        if (last && last.message.startsWith(BENCH_PREFIX)) {
          // Replace in-place
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, message: msg, timestamp: new Date() };
          return updated;
        }
        // First progress entry
        return [...prev, { id: nextId++, type: 'info' as LogEntryType, message: msg, timestamp: new Date() }];
      });
    };

    eventBus.on('sim:play', onPlay);
    eventBus.on('sim:pause', onPause);
    eventBus.on('sim:reset', onReset);
    eventBus.on('sim:presetLoaded', onPresetLoaded);
    eventBus.on('sim:clear', onClear);
    eventBus.on('sim:speedChange', onSpeedChange);
    eventBus.on('sim:paramChanged', onParamChanged);
    eventBus.on('bench:progress', onBenchProgress);

    return () => {
      eventBus.off('sim:play', onPlay);
      eventBus.off('sim:pause', onPause);
      eventBus.off('sim:reset', onReset);
      eventBus.off('sim:presetLoaded', onPresetLoaded);
      eventBus.off('sim:clear', onClear);
      eventBus.off('sim:speedChange', onSpeedChange);
      eventBus.off('sim:paramChanged', onParamChanged);
      eventBus.off('bench:progress', onBenchProgress);
    };
  }, [addLogEntry]);

  const executeInput = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Add to command history
    commandHistoryRef.current.push(trimmed);
    historyIndexRef.current = -1;

    // Try to parse as a command
    const parsed = parseCommand(trimmed, commandRegistry);

    if (parsed && isCommand(trimmed, commandRegistry)) {
      addLogEntry('command', `> ${trimmed}`);
      aiService.addRecentAction(trimmed);
      learningModel.record(parsed.commandName);

      const result = await commandRegistry.execute(parsed.commandName, parsed.params);

      if (result.success) {
        if (result.data) {
          const formatted = formatCommandResult(parsed.commandName, result.data);
          addLogEntry('info', formatted.message, formatted.structured);
        }
      } else {
        addLogEntry('error', result.error ?? 'Command failed');
      }
    } else {
      // Non-command input -- route to AI assistant
      addLogEntry('command', `> ${trimmed}`);
      aiService.addRecentAction(trimmed);
      await aiService.handleTerminalInput(trimmed, addLogEntry);
    }

    setInputValue('');
    setGhostText('');
  }, [addLogEntry]);

  const handleInputChange = useCallback((value: string) => {
    cycleRef.current = null;
    setInputValue(value);
    // Update ghost text
    const ghost = getGhostText(value, commandRegistry);
    setGhostText(ghost);
  }, []);

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    const history = commandHistoryRef.current;
    if (history.length === 0) return;

    if (direction === 'up') {
      if (historyIndexRef.current === -1) {
        historyIndexRef.current = history.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
      }
      setInputValue(history[historyIndexRef.current]);
    } else {
      if (historyIndexRef.current === -1) return;
      if (historyIndexRef.current < history.length - 1) {
        historyIndexRef.current++;
        setInputValue(history[historyIndexRef.current]);
      } else {
        historyIndexRef.current = -1;
        setInputValue('');
      }
    }
  }, []);

  const acceptGhostText = useCallback(() => {
    const cycle = cycleRef.current;

    // Active cycle: advance to next candidate
    if (cycle && inputValue.trim() === cycle.candidates[cycle.index]) {
      const nextIndex = (cycle.index + 1) % cycle.candidates.length;
      cycleRef.current = { ...cycle, index: nextIndex };
      const candidate = cycle.candidates[nextIndex];
      const withSpace = candidate + ' ';
      setInputValue(withSpace);
      const ghost = getGhostText(withSpace, commandRegistry);
      setGhostText(ghost);
      return;
    }

    if (ghostText) {
      const trimmedGhost = ghostText.trimStart();
      const isArgHint = /^[<\[]/.test(trimmedGhost);

      if (isArgHint) {
        const trimmed = inputValue.trim();
        const parts = trimmed.split(/\s+/);

        if (parts.length <= 2) {
          // At command level with arg hints showing — cycle to next subcommand
          const candidates = getCycleCandidates(trimmed, commandRegistry);
          if (candidates.length > 1) {
            const currentIndex = candidates.indexOf(trimmed);
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % candidates.length : 0;
            cycleRef.current = { baseInput: trimmed, candidates, index: nextIndex };
            const candidate = candidates[nextIndex];
            const withSpace = candidate + ' ';
            setInputValue(withSpace);
            const ghost = getGhostText(withSpace, commandRegistry);
            setGhostText(ghost);
          }
        } else if (!inputValue.endsWith(' ')) {
          // Mid-arg — Tab adds space to advance to next param
          const withSpace = trimmed + ' ';
          setInputValue(withSpace);
          const ghost = getGhostText(withSpace, commandRegistry);
          setGhostText(ghost);
          cycleRef.current = null;
        }
        return;
      }

      // Regular completion — accept ghost text
      const newValue = inputValue + ghostText;
      const parts = newValue.trim().split(/\s+/);

      // Always add trailing space after completion
      const withSpace = newValue + ' ';
      setInputValue(withSpace);
      const ghost = getGhostText(withSpace, commandRegistry);
      setGhostText(ghost);
      cycleRef.current = null;

      // If completed a subcommand (not just a category), no special handling needed
      // The trailing space + getGhostText will show arg hints or next subcommand hint
      void parts; // used for clarity, lint suppression
      return;
    }

    // No ghost text, no active cycle
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/);

    // Don't cycle if input has args (user is filling params or command is complete)
    if (parts.length > 2) return;

    // Start cycling for category or command-level inputs
    const candidates = getCycleCandidates(trimmed, commandRegistry);
    if (candidates.length > 1) {
      const currentIndex = candidates.indexOf(trimmed);
      const firstIndex = currentIndex >= 0 ? (currentIndex + 1) % candidates.length : 0;
      cycleRef.current = { baseInput: trimmed, candidates, index: firstIndex };
      const candidate = candidates[firstIndex];
      const withSpace = candidate + ' ';
      setInputValue(withSpace);
      const ghost = getGhostText(withSpace, commandRegistry);
      setGhostText(ghost);
    } else if (candidates.length === 1 && candidates[0] !== trimmed) {
      const withSpace = candidates[0] + ' ';
      setInputValue(withSpace);
      const ghost = getGhostText(withSpace, commandRegistry);
      setGhostText(ghost);
      cycleRef.current = null;
    }
  }, [inputValue, ghostText]);

  return {
    output,
    inputValue,
    ghostText,
    handleInputChange,
    executeInput,
    navigateHistory,
    acceptGhostText,
    addLogEntry,
  };
}
