import React from "react";

function IconBase({ children, size = 16, width, height, strokeWidth = 1.8, fill = "none", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width || size}
      height={height || size}
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

const circle = <circle cx="12" cy="12" r="9" />;

export function ChevronDown(props) { return <IconBase {...props}><path d="M6 9l6 6 6-6" /></IconBase>; }
export function ChevronUp(props) { return <IconBase {...props}><path d="M6 15l6-6 6 6" /></IconBase>; }
export function ChevronRight(props) { return <IconBase {...props}><path d="M9 6l6 6-6 6" /></IconBase>; }
export function ChevronLeft(props) { return <IconBase {...props}><path d="M15 6l-6 6 6 6" /></IconBase>; }

export function RunIcon(props) { return <IconBase {...props}><circle cx="15.5" cy="5.5" r="2" /><path d="M10 21l2.2-5.4 2.6-2.1 1.8 2.3" /><path d="M8.5 13.5l3.4-3.2 2.8 1 2.3-2.3" /><path d="M9.5 9.8l-2.8 3" /></IconBase>; }
export function StrengthIcon(props) { return <IconBase {...props}><path d="M3.5 10.5v3" /><path d="M6 9v6" /><path d="M18 9v6" /><path d="M20.5 10.5v3" /><path d="M6 12h12" /></IconBase>; }
export function BikeIcon(props) { return <IconBase {...props}><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17l3-6 3 6" /><path d="M12 11h4" /><path d="M10 8h3" /></IconBase>; }
export function WalkIcon(props) { return <IconBase {...props}><circle cx="12.5" cy="5" r="2" /><path d="M11 21l1.2-5.5" /><path d="M9 13l3-3 2.5 2.5" /><path d="M12 10l-1.5 4-3 2" /><path d="M13.5 14.5l3 2.5" /></IconBase>; }
export function OTFIcon(props) { return <IconBase {...props}><path d="M13 2L6 13h5l-1 9 8-12h-5l0-8z" fill="currentColor" stroke="none" /></IconBase>; }

export function CheckCircle(props) { return <IconBase {...props}>{circle}<path d="M8 12l2.5 2.5L16 9" /></IconBase>; }
export function XCircle(props) { return <IconBase {...props}>{circle}<path d="M9 9l6 6" /><path d="M15 9l-6 6" /></IconBase>; }
export function AlertCircle(props) { return <IconBase {...props}>{circle}<path d="M12 8v5" /><path d="M12 16h.01" /></IconBase>; }
export function InfoCircle(props) { return <IconBase {...props}>{circle}<path d="M12 10v6" /><path d="M12 7h.01" /></IconBase>; }

export function PlusIcon(props) { return <IconBase {...props}><path d="M12 5v14" /><path d="M5 12h14" /></IconBase>; }
export function TrashIcon(props) { return <IconBase {...props}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M8 10v8" /><path d="M12 10v8" /><path d="M16 10v8" /></IconBase>; }
export function EditIcon(props) { return <IconBase {...props}><path d="M4 20l4.5-1 9-9-3.5-3.5-9 9L4 20z" /><path d="M13.5 6.5l3.5 3.5" /></IconBase>; }
export function CopyIcon(props) { return <IconBase {...props}><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" /></IconBase>; }
export function ShareIcon(props) { return <IconBase {...props}><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 11l8-5" /><path d="M8 13l8 5" /></IconBase>; }
export function SettingsIcon(props) { return <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2H9a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7z" /></IconBase>; }

export function HeartIcon(props) { return <IconBase {...props}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="none" /></IconBase>; }
export function BatteryIcon(props) { return <IconBase {...props}><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10v4" /><path d="M6 10h7v4H6z" fill="currentColor" stroke="none" /></IconBase>; }
export function SleepIcon(props) { return <IconBase {...props}><path d="M14.5 4.5a7.5 7.5 0 1 0 5 13.1A8 8 0 0 1 14.5 4.5z" fill="currentColor" stroke="none" /></IconBase>; }
export function DropIcon(props) { return <IconBase {...props}><path d="M12 3C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11z" /></IconBase>; }

export function ArrowUp(props) { return <IconBase {...props}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></IconBase>; }
export function ArrowDown(props) { return <IconBase {...props}><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></IconBase>; }
export function ArrowRight(props) { return <IconBase {...props}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></IconBase>; }

export function WatchIcon(props) { return <IconBase {...props}><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 2h6l1 4H8l1-4z" /><path d="M9 22h6l1-4H8l1 4z" /></IconBase>; }
export function SyncIcon(props) { return <IconBase {...props}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.5 9A7 7 0 0 1 18 7" /><path d="M17.5 15A7 7 0 0 1 6 17" /></IconBase>; }

