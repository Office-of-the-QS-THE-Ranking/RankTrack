"use client";

import { useState } from "react";
import { useGovern, useViewer } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { DateField, Select } from "@/components/ui/pickers";

/** Ask for temporary access to a dataset; it goes to the data access approval workflow. */
export function RequestDataAccess({ datasets }: { datasets: { id: string; name: string; classification: string }[] }) {
  const viewer = useViewer();
  const { run, pending } = useGovern();
  const [f, setF] = useState({ datasetId: "", until: "", justification: "" });
  if (!viewer) return null;
  return (
    <Card title="Request access to another dataset" icon="key" sub="Approved access is temporary and ends automatically">
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run({ type: "request.create", workflowId: "data-access", payload: { kind: "data-access", accountId: viewer.id, datasetId: f.datasetId, access: "View", until: f.until }, justification: f.justification });
          toast(r.message, r.ok ? "ok" : "error");
          if (r.ok) setF({ datasetId: "", until: "", justification: "" });
        }}
      >
        <div className="grid cols-2">
          <label className="field">
            <span className="field__label">Dataset</span>
            <Select className="select" value={f.datasetId} onChange={(v) => setF({ ...f, datasetId: v })} required>
              <option value="">Choose</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.classification})
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span className="field__label">Until</span>
            <DateField className="input" value={f.until} onChange={(v) => setF({ ...f, until: v })} required />
          </label>
        </div>
        <label className="field">
          <span className="field__label">What it is for</span>
          <textarea className="textarea" value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} required />
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn--dark" disabled={pending}>
            <Icon name="send" size={16} /> Send for approval
          </button>
        </div>
      </form>
    </Card>
  );
}
