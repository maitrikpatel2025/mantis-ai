export function Label({ children, className = '', ...props }) {
  return (
    <label
      className={`flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}
