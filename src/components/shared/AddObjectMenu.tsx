/**
 * AddObjectMenu: dropdown menu for creating new objects.
 *
 * Used in Object Manager header (full menu) and Pipeline View header (ops only).
 * All creation goes through commandRegistry.execute().
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useSceneStore } from '@/store/sceneStore';
import { uiStoreActions } from '@/store/uiStore';
import { NODE_TYPES } from '@/engine/scene/SceneNode';

type MenuVariant = 'full' | 'pipeline';

interface AddObjectMenuProps {
  /** 'full' shows all types, 'pipeline' shows ops only */
  variant: MenuVariant;
  /** Anchor position (bottom-left of the + button) */
  x: number;
  y: number;
  onClose: () => void;
}

export function AddObjectMenu({ variant, x, y, onClose }: AddObjectMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showOpSub, setShowOpSub] = useState(false);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Keep menu on screen
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, [x, y]);

  const findSimRoot = useCallback(() => {
    const nodes = useSceneStore.getState().nodes;
    for (const n of Object.values(nodes)) {
      if (n.type === NODE_TYPES.SIM_ROOT) return n.id;
    }
    return null;
  }, []);

  const addOp = useCallback(async (source: 'code' | 'script') => {
    const params = source === 'code'
      ? { source: 'code' as const, property: 'alpha', code: '', phase: 'post-rule' as const }
      : { source: 'script' as const, name: 'New Script', code: '', inputs: [] as string[], outputs: [] as string[], phase: 'post-rule' as const };
    const result = await commandRegistry.execute('op.add', params);
    if (result.success && result.data) {
      const opId = (result.data as { id: string }).id;
      // Focus the new op in the inspector
      const nodes = useSceneStore.getState().nodes;
      for (const node of Object.values(nodes)) {
        if (node.tags.includes(opId)) {
          commandRegistry.execute('scene.select', { id: node.id });
          break;
        }
      }
      uiStoreActions.focusOp(opId);
    }
    onClose();
  }, [onClose]);

  const addCellType = useCallback(async () => {
    const parentId = findSimRoot();
    await commandRegistry.execute('scene.add', {
      type: 'cell-type',
      name: 'New Cell Type',
      parentId,
      properties: { color: '#888888' },
    });
    onClose();
  }, [findSimRoot, onClose]);

  const addParam = useCallback(async () => {
    await commandRegistry.execute('param.add', {
      name: 'newParam',
      type: 'float',
      default: 0,
      min: 0,
      max: 1,
      step: 0.01,
    });
    onClose();
  }, [onClose]);

  const addVariable = useCallback(async () => {
    await commandRegistry.execute('var.set', { name: 'newVar', value: 0 });
    onClose();
  }, [onClose]);

  const addGroup = useCallback(async () => {
    const parentId = findSimRoot();
    await commandRegistry.execute('scene.add', {
      type: 'group',
      name: 'New Group',
      parentId,
    });
    onClose();
  }, [findSimRoot, onClose]);

  const itemClass = 'w-full text-left text-[11px] font-mono px-2.5 py-1 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer transition-colors';
  const divider = <div className="mx-1.5 my-0.5 border-t border-zinc-700/60" />;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[170px] bg-zinc-800 border border-zinc-600/50 rounded shadow-lg py-0.5"
      style={{ left: x, top: y }}
      data-testid="add-object-menu"
    >
      {/* Op sub-menu */}
      <div
        className="relative"
        onMouseEnter={() => setShowOpSub(true)}
        onMouseLeave={() => setShowOpSub(false)}
      >
        <button className={`${itemClass} flex items-center justify-between`}>
          <span>Add Op</span>
          <span className="text-zinc-500 text-[9px]">{'\u25B8'}</span>
        </button>
        {showOpSub && (
          <div className="absolute left-full top-0 ml-0.5 min-w-[130px] bg-zinc-800 border border-zinc-600/50 rounded shadow-lg py-0.5">
            <button onClick={() => addOp('code')} className={itemClass}>
              Expression
            </button>
            <button onClick={() => addOp('script')} className={itemClass}>
              Script
            </button>
          </div>
        )}
      </div>

      {variant === 'full' && (
        <>
          {divider}
          <button onClick={addCellType} className={itemClass}>
            Add Cell Type
          </button>
          <button onClick={addParam} className={itemClass}>
            Add Env Param
          </button>
          <button onClick={addVariable} className={itemClass}>
            Add Variable
          </button>
          {divider}
          <button onClick={addGroup} className={itemClass}>
            Add Group
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
