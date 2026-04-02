import ControlPanel, { type ControlData } from './control-panel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export const metadata = {
  title: 'Control Panel — Erika',
};

export default async function ControlPage() {
  const res = await fetch(`${API_URL}/control`, { cache: 'no-store' });
  const control = (await res.json()) as ControlData;

  return (
    <div className="pt-4">
      <h1 className="mb-6 text-2xl font-bold">Control Panel</h1>
      <ControlPanel initialControl={control} />
    </div>
  );
}
