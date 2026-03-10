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
import { parseCommand, isCommand, getGhostText } from './commandParser';
import { aiService } from '@/ai/aiService';

export type LogEntryType = 'command' | 'info' | 'error' | 'ai';

export interface LogEntry {
  id: number;
  type: LogEntryType;
  message: string;
  timestamp: Date;
}

const MAX_SCROLLBACK = 500;

let nextId = 0;

export function useTerminal() {
  const [output, setOutput] = useState<LogEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [ghostText, setGhostText] = useState('');
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const addLogEntry = useCallback((type: LogEntryType, message: string) => {
    setOutput((prev) => {
      const entry: LogEntry = {
        id: nextId++,
        type,
        message,
        timestamp: new Date(),
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

    eventBus.on('sim:play', onPlay);
    eventBus.on('sim:pause', onPause);
    eventBus.on('sim:reset', onReset);
    eventBus.on('sim:presetLoaded', onPresetLoaded);
    eventBus.on('sim:clear', onClear);
    eventBus.on('sim:speedChange', onSpeedChange);

    return () => {
      eventBus.off('sim:play', onPlay);
      eventBus.off('sim:pause', onPause);
      eventBus.off('sim:reset', onReset);
      eventBus.off('sim:presetLoaded', onPresetLoaded);
      eventBus.off('sim:clear', onClear);
      eventBus.off('sim:speedChange', onSpeedChange);
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

      const result = await commandRegistry.execute(parsed.commandName, parsed.params);

      if (result.success) {
        if (result.data) {
          addLogEntry('info', JSON.stringify(result.data));
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
    if (ghostText) {
      const newValue = inputValue + ghostText;
      setInputValue(newValue);
      setGhostText('');
      // Re-compute ghost text for the new value
      const nextGhost = getGhostText(newValue, commandRegistry);
      setGhostText(nextGhost);
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
