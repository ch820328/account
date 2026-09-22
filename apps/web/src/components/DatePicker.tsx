"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export interface DatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  isDirty?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_NAMES = [
  "1 月", "2 月", "3 月", "4 月", "5 月", "6 月",
  "7 月", "8 月", "9 月", "10 月", "11 月", "12 月",
];

export function DatePicker({
  value,
  onChange,
  placeholder = "選擇日期",
  isDirty = false,
  disabled = false,
  style,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Parse initial date or default to today
  const parsedDate = value ? new Date(value + "T00:00:00") : new Date();
  const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const [viewYear, setViewYear] = useState(validDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(validDate.getMonth()); // 0-indexed

  // Keep view in sync when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Position calculation for portal
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 260;
    const popoverHeight = 310;

    let left = rect.left;
    // Keep in viewport horizontally
    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }
    if (left < 12) left = 12;

    let top = rect.bottom + 6;
    // If overflowing bottom, show above
    if (top + popoverHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - popoverHeight - 6);
    }

    setPopoverPos({ top, left, width: popoverWidth });
  };

  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setIsOpen(true);
  };

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, "0");
    const dStr = String(day).padStart(2, "0");
    const nextVal = `${viewYear}-${mStr}-${dStr}`;
    onChange(nextVal);
    setIsOpen(false);
  };

  const handleSetToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setIsOpen(false);
  };

  const handleSetFirstOfMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const mStr = String(viewMonth + 1).padStart(2, "0");
    onChange(`${viewYear}-${mStr}-01`);
    setIsOpen(false);
  };

  // Calendar days grid generation
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonthCells: number[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    prevMonthCells.push(daysInPrevMonth - i);
  }

  const currentMonthCells: number[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentMonthCells.push(i);
  }

  const totalFilled = prevMonthCells.length + currentMonthCells.length;
  const nextMonthCells: number[] = [];
  const remainingCells = (7 - (totalFilled % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    nextMonthCells.push(i);
  }

  const isSelected = (day: number) => {
    if (!value) return false;
    const [y, m, d] = value.split("-").map(Number);
    return y === viewYear && m === viewMonth + 1 && d === day;
  };

  const isToday = (day: number) => {
    const now = new Date();
    return (
      now.getFullYear() === viewYear &&
      now.getMonth() === viewMonth &&
      now.getDate() === day
    );
  };

  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 9px",
          background: isDirty ? "rgba(59, 130, 246, 0.12)" : "rgba(255, 255, 255, 0.04)",
          border: isDirty
            ? "1px solid var(--accent, #398bf7)"
            : isOpen
            ? "1px solid var(--accent, #398bf7)"
            : "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: 6,
          color: value ? "var(--text, #e2e8f0)" : "var(--muted, #8b99a8)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          fontWeight: 500,
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          transition: "all 0.15s ease",
          boxShadow: isOpen ? "0 0 0 2px rgba(57, 139, 247, 0.2)" : "none",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isDirty && !isOpen) {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)";
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.07)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isDirty && !isOpen) {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
          }
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isDirty ? "var(--accent, #398bf7)" : "currentColor"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.8, flexShrink: 0 }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{value || placeholder}</span>
      </button>

      {/* Popover via Portal */}
      {isOpen &&
        popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              width: popoverPos.width,
              background: "#19222d",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)",
              zIndex: 99999,
              padding: 12,
              color: "var(--text, #e2e8f0)",
              fontSize: 12,
              backdropFilter: "blur(20px)",
              animation: "datePickerFadeIn 0.15s ease-out",
            }}
          >
            {/* Header: Month & Year Navigator */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 4,
                  color: "var(--text, #e2e8f0)",
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ‹
              </button>

              <div style={{ fontWeight: 600, fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
                <span>{viewYear} 年</span>
                <span style={{ color: "var(--accent, #398bf7)" }}>{MONTH_NAMES[viewMonth]}</span>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 4,
                  color: "var(--text, #e2e8f0)",
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ›
              </button>
            </div>

            {/* Weekdays */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                textAlign: "center",
                fontWeight: 600,
                fontSize: 11,
                color: "var(--muted, #8b99a8)",
                marginBottom: 6,
              }}
            >
              {WEEKDAYS.map((w, idx) => (
                <div key={idx} style={{ padding: "3px 0" }}>
                  {w}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 2,
              }}
            >
              {/* Prev Month Days */}
              {prevMonthCells.map((d, i) => (
                <div
                  key={`prev-${i}`}
                  style={{
                    textAlign: "center",
                    padding: "5px 0",
                    color: "rgba(255, 255, 255, 0.2)",
                    fontSize: 11,
                    userSelect: "none",
                  }}
                >
                  {d}
                </div>
              ))}

              {/* Current Month Days */}
              {currentMonthCells.map((d) => {
                const selected = isSelected(d);
                const today = isToday(d);
                return (
                  <button
                    key={`cur-${d}`}
                    type="button"
                    onClick={() => handleSelectDay(d)}
                    style={{
                      border: today && !selected ? "1px solid rgba(57, 139, 247, 0.6)" : "none",
                      background: selected
                        ? "var(--accent, #398bf7)"
                        : "transparent",
                      color: selected
                        ? "#ffffff"
                        : today
                        ? "var(--accent, #398bf7)"
                        : "var(--text, #e2e8f0)",
                      fontWeight: selected || today ? 600 : 400,
                      borderRadius: 6,
                      padding: "5px 0",
                      fontSize: 12,
                      cursor: "pointer",
                      outline: "none",
                      transition: "background 0.12s ease",
                      boxShadow: selected ? "0 2px 8px rgba(57, 139, 247, 0.4)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    {d}
                  </button>
                );
              })}

              {/* Next Month Days */}
              {nextMonthCells.map((d, i) => (
                <div
                  key={`next-${i}`}
                  style={{
                    textAlign: "center",
                    padding: "5px 0",
                    color: "rgba(255, 255, 255, 0.2)",
                    fontSize: 11,
                    userSelect: "none",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Quick Shortcuts */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <button
                type="button"
                onClick={handleSetToday}
                style={{
                  flex: 1,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  color: "var(--text, #e2e8f0)",
                  cursor: "pointer",
                }}
              >
                今日
              </button>
              <button
                type="button"
                onClick={handleSetFirstOfMonth}
                style={{
                  flex: 1,
                  background: "rgba(57, 139, 247, 0.1)",
                  border: "1px solid rgba(57, 139, 247, 0.25)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  color: "var(--accent, #398bf7)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                本月 1 號
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
