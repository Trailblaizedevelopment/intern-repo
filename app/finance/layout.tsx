export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh' }}>
      {children}
    </div>
  );
}
