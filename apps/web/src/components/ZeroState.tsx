import Link from "next/link";

interface ZeroStateProps {
  title?: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onActionClick?: () => void;
  secondaryActionText?: string;
  secondaryActionHref?: string;
  onSecondaryActionClick?: () => void;
  icon?: string;
}

export function ZeroState({
  title = "尚無資料",
  description,
  actionText,
  actionHref,
  onActionClick,
  secondaryActionText,
  secondaryActionHref,
  onSecondaryActionClick,
  icon,
}: ZeroStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "36px 20px",
        textAlign: "center",
        background: "rgba(20, 27, 36, 0.4)",
        borderRadius: "var(--radius)",
        border: "1px dashed var(--border)",
      }}
    >
      {icon && (
        <span style={{ fontSize: "36px", marginBottom: "12px", display: "block", userSelect: "none" }}>
          {icon}
        </span>
      )}
      <h4 style={{ margin: "0 0 8px 0", fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
        {title}
      </h4>
      <p className="muted" style={{ margin: "0 0 16px 0", fontSize: "13px", maxWidth: "340px", lineHeight: "1.5" }}>
        {description}
      </p>
      {(actionText || secondaryActionText) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {actionText && (
            actionHref ? (
              <Link href={actionHref} className="btn" style={{ fontSize: "13px", padding: "8px 18px", fontWeight: 600 }}>
                {actionText}
              </Link>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={onActionClick}
                style={{ fontSize: "13px", padding: "8px 18px", fontWeight: 600 }}
              >
                {actionText}
              </button>
            )
          )}
          {secondaryActionText && (
            secondaryActionHref ? (
              <Link href={secondaryActionHref} className="btn ghost" style={{ fontSize: "13px", padding: "8px 16px" }}>
                {secondaryActionText}
              </Link>
            ) : (
              <button
                type="button"
                className="btn ghost"
                onClick={onSecondaryActionClick}
                style={{ fontSize: "13px", padding: "8px 16px" }}
              >
                {secondaryActionText}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
