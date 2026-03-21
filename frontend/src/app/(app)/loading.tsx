export default function AppLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
        <span className="text-sm text-slate-500">Loading…</span>
      </div>
    </div>
  );
}
