"use client";

import type { ReactNode } from "react";

/**
 * Shared list row with an inline edit panel that expands in place, used across
 * all schedule tabs (payroll / loan / installment / recurring / RSU).
 */
export function EditableRow({
  primary,
  secondary,
  right,
  editing,
  onEdit,
  onClose,
  onDelete,
  active,
  onToggleActive,
  canEdit = true,
  finished = false,
  children,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  right?: ReactNode;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
  active?: boolean;
  onToggleActive?: () => void;
  canEdit?: boolean;
  finished?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`list-item${finished ? " finished" : ""}${editing ? " editing" : ""}`}>
      <div className="row">
        <div className="meta">
          <span className="primary">{primary}</span>
          <span className="secondary">{secondary}</span>
        </div>
        <div className="row-inline">
          {!editing && right}
          {canEdit && (
            <button type="button" className="btn ghost" onClick={() => (editing ? onClose() : onEdit())}>
              {editing ? "收合" : "編輯"}
            </button>
          )}
          {!editing && onToggleActive && (
            <button type="button" className="btn ghost" onClick={onToggleActive}>
              {active ? "暫停" : "啟用"}
            </button>
          )}
          {!editing && (
            <button type="button" className="btn ghost" onClick={onDelete}>
              刪除
            </button>
          )}
        </div>
      </div>
      {editing && <div className="row-edit-panel">{children}</div>}
    </div>
  );
}
