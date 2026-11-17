// Test-only composition. Never imported by application routes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Input } from '../../src/components/common/Input';
import { Select } from '../../src/components/common/Select';
import { Button } from '../../src/components/common/Button';
import { Modal } from '../../src/components/common/Modal';
import { DataTable } from '../../src/components/admin/DataTable';
import { Loading } from '../../src/components/common/Loading';
import { EmptyState } from '../../src/components/common/EmptyState';
import { ErrorState } from '../../src/components/common/ErrorState';
import { Badge } from '../../src/components/common/Badge';
import { ToastProvider, useToast } from '../../src/contexts/ToastContext';
import '../../src/index.css';

function Fixture() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const rows = Array.from({ length: 8 }, (_, index) => ({ id: index, name: `Test record ${index}` }));
  return <BrowserRouter><main className="inventory-workspace mx-auto max-w-5xl p-4 space-y-5">
    <header className="inventory-heading"><h1>Component verification</h1></header>
    <Input label="Password" type="password" error="Validation message" aria-describedby="help" />
    <p id="help">Test instructions</p>
    <Select label="Batch" options={[{ value: 'batch', label: 'Test batch' }]} error="Select validation" />
    <Button onClick={() => setOpen(true)}>Open dialog</Button>
    <Button isLoading>Saving</Button><Badge status="IN_STOCK" />
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Test dialog">
      <Input label="Quantity" type="number" />
      <Button onClick={() => toast.error('Test modal feedback')}>Report test error</Button>
      <Button onClick={() => { toast.success('Test saved feedback'); setSaved(true); setOpen(false); }}>Save test</Button>
    </Modal>
    {saved && <p role="status">Test saved</p>}
    <DataTable caption="Test records" columns={[{ header: 'Name', render: row => row.name }]} data={rows.filter(row => row.name.includes(search))} searchValue={search} onSearchChange={setSearch} />
    <Loading /><EmptyState /><ErrorState message="Test failure" />
  </main></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<ToastProvider><Fixture /></ToastProvider>);
