import * as React from "react";

export type EmailAction = {
  label: string;
  href: string;
};

type CommonsEmailProps = {
  preview: string;
  title: string;
  eyebrow?: string;
  intro: string;
  children?: React.ReactNode;
  action?: EmailAction;
  footerNote?: string;
};

const colors = {
  ink: "#020617",
  slate: "#475569",
  muted: "#64748b",
  border: "#e2e8f0",
  surface: "#f8fafc",
  lime: "#B8F56D",
  cyan: "#71E0E7",
  violet: "#9FB0F4",
  rose: "#F3A2B4",
};

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export function CommonsEmail({
  preview,
  title,
  eyebrow = "CommonLab",
  intro,
  children,
  action,
  footerNote,
}: CommonsEmailProps) {
  return (
    <html lang="en">
      <body style={styles.body}>
        <div style={styles.preview}>{preview}</div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
          <tbody>
            <tr>
              <td align="center" style={styles.shell}>
                <table role="presentation" width="100%" style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.colorBar}>
                        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              <td style={{ ...styles.colorCell, backgroundColor: colors.lime }} />
                              <td style={{ ...styles.colorCell, backgroundColor: colors.cyan }} />
                              <td style={{ ...styles.colorCell, backgroundColor: colors.violet }} />
                              <td style={{ ...styles.colorCell, backgroundColor: colors.rose }} />
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.topBar}>
                        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              <td style={styles.logoMark}>C</td>
                              <td style={styles.logoText}>
                                <p style={styles.brand}>CommonLab</p>
                                <p style={styles.tagline}>Courses and learning sandboxes</p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.content}>
                        <p style={styles.eyebrow}>{eyebrow}</p>
                        <h1 style={styles.title}>{title}</h1>
                        <p style={styles.intro}>{intro}</p>
                        {children ? <div style={styles.section}>{children}</div> : null}
                        {action ? (
                          <p style={styles.actionRow}>
                            <a href={action.href} style={styles.button}>
                              {action.label}
                            </a>
                          </p>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          {footerNote ||
                            "You are receiving this because you use CommonLab courses."}
                        </p>
                        <p style={styles.footerText}>
                          <a href={baseUrl} style={styles.footerLink}>
                            commonlab
                          </a>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export function DetailList({ items }: { items: Array<[string, string | undefined]> }) {
  const visibleItems = items.filter(([, value]) => value);
  if (!visibleItems.length) return null;

  return (
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={styles.details}>
      <tbody>
        {visibleItems.map(([label, value]) => (
          <tr key={label}>
            <td style={styles.detailLabel}>{label}</td>
            <td style={styles.detailValue}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p style={styles.paragraph}>{children}</p>;
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily:
      "'Space Grotesk', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  preview: {
    display: "none",
    maxHeight: 0,
    overflow: "hidden",
    opacity: 0,
  },
  shell: {
    padding: "32px 16px",
  },
  card: {
    maxWidth: "620px",
    borderCollapse: "separate",
    borderSpacing: 0,
    backgroundColor: "#ffffff",
    border: `1px solid ${colors.border}`,
    borderRadius: "12px",
    overflow: "hidden",
  },
  colorBar: {
    padding: 0,
    height: "8px",
    lineHeight: "8px",
  },
  colorCell: {
    height: "8px",
    lineHeight: "8px",
    fontSize: 0,
  },
  topBar: {
    padding: "22px 28px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: "#ffffff",
  },
  logoMark: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    backgroundColor: colors.ink,
    color: "#ffffff",
    fontSize: "20px",
    lineHeight: "42px",
    fontWeight: 800,
    textAlign: "center",
    verticalAlign: "middle",
  },
  logoText: {
    paddingLeft: "12px",
    verticalAlign: "middle",
  },
  content: {
    padding: "34px 30px 28px",
  },
  brand: {
    margin: 0,
    color: colors.ink,
    fontSize: "19px",
    lineHeight: "23px",
    fontWeight: 800,
    letterSpacing: 0,
  },
  tagline: {
    margin: "2px 0 0",
    color: colors.muted,
    fontSize: "12px",
    lineHeight: "17px",
    fontWeight: 700,
  },
  eyebrow: {
    margin: "0 0 10px",
    color: colors.slate,
    fontSize: "14px",
    fontWeight: 700,
  },
  title: {
    margin: "0 0 16px",
    color: colors.ink,
    fontSize: "30px",
    lineHeight: "38px",
    fontWeight: 800,
    letterSpacing: 0,
  },
  intro: {
    margin: 0,
    color: colors.slate,
    fontSize: "16px",
    lineHeight: "26px",
  },
  section: {
    marginTop: "22px",
  },
  paragraph: {
    margin: "0 0 16px",
    color: colors.slate,
    fontSize: "15px",
    lineHeight: "24px",
  },
  actionRow: {
    margin: "28px 0 0",
  },
  button: {
    display: "inline-block",
    backgroundColor: colors.ink,
    color: "#ffffff",
    borderRadius: "8px",
    padding: "13px 18px",
    fontSize: "14px",
    fontWeight: 800,
    textDecoration: "none",
  },
  details: {
    marginTop: "4px",
    border: `1px solid ${colors.border}`,
    borderRadius: "10px",
    overflow: "hidden",
  },
  detailLabel: {
    width: "36%",
    padding: "12px 14px",
    backgroundColor: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.muted,
    fontSize: "13px",
    fontWeight: 700,
  },
  detailValue: {
    padding: "12px 14px",
    borderBottom: `1px solid ${colors.border}`,
    color: colors.ink,
    fontSize: "14px",
    lineHeight: "21px",
    fontWeight: 700,
  },
  footer: {
    padding: "20px 30px",
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
  },
  footerText: {
    margin: "0 0 6px",
    color: colors.muted,
    fontSize: "12px",
    lineHeight: "18px",
  },
  footerLink: {
    color: colors.ink,
    textDecoration: "none",
    fontWeight: 800,
  },
};
