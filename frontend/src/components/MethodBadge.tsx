interface MethodBadgeProps {
  method: string;
}

export function MethodBadge({
  method
}: MethodBadgeProps) {
  const normalizedMethod = method.toUpperCase();

  return (
    <span
      className={`method-badge method-${normalizedMethod.toLowerCase()}`}
    >
      {normalizedMethod}
    </span>
  );
}