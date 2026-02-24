export function Card({ children, className = '' }) {
  return (
    <div className={`bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`grid auto-rows-min items-start gap-2 px-6 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h2 className={`leading-none font-semibold ${className}`}>{children}</h2>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-muted-foreground text-sm ${className}`}>{children}</p>;
}

export function CardAction({ children, className = '' }) {
  return <div className={`self-start justify-self-end ${className}`}>{children}</div>;
}

export function CardContent({ children, className = '' }) {
  return <div className={`px-6 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return <div className={`flex items-center px-6 ${className}`}>{children}</div>;
}
