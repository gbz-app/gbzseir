"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAdminAction } from "@/features/admin/components/use-admin-action";
import { AI_MODELS, AI_PROVIDER_IDS, AI_PROVIDERS, modelsOf, type AiModelId, type AiProvider } from "../lib/models";
import { saveAiSettingsAction } from "./actions";

export type AiSettingsValues = {
  enabled: boolean;
  provider: AiProvider;
  model: AiModelId;
  dailyMessages: number;
  perMinute: number;
  dailyBudgetUsd: number;
};

const PROVIDER_OPTIONS: Record<AiProvider, string> = {
  openai: "OpenAI (GPT)",
  anthropic: "Anthropic (Claude)",
};

function Row({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        {help ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{help}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** GebzemAI switches, provider, model and limits (admin_set_ai_settings). */
export function AiSettingsForm({ initial }: { initial: AiSettingsValues }) {
  const { pending, run } = useAdminAction();
  const [v, setV] = React.useState(initial);
  const set = <K extends keyof AiSettingsValues>(k: K, value: AiSettingsValues[K]) => setV((s) => ({ ...s, [k]: value }));
  // Another provider: keep the model when it belongs to it, else that provider's default.
  const setProvider = (p: AiProvider) =>
    setV((s) => ({ ...s, provider: p, model: AI_MODELS[s.model].provider === p ? s.model : AI_PROVIDERS[p].defaultModel }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const info = AI_PROVIDERS[v.provider];

  return (
    <form
      className="rounded-2xl bg-card px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveAiSettingsAction(v), { refresh: true });
      }}
    >
      <h2 className="border-b py-3 font-heading text-base font-bold">Ayarlar</h2>
      <Row id="ai-enabled" label="GebzemAI" help={`Kapalıyken sayfa 'henüz aktif değil' der ve aramaya yönlendirir. ${info.keyEnv} tanımlı değilse açık olsa da çalışmaz.`}>
        <div className="flex items-center gap-3">
          <Switch id="ai-enabled" checked={v.enabled} onCheckedChange={(c) => set("enabled", c)} />
          <span className="text-sm">{v.enabled ? "Açık" : "Kapalı"}</span>
        </div>
      </Row>
      <Row
        id="ai-provider"
        label="Sağlayıcı"
        help={`Yanıtları üreten servis: ${info.label}. Anahtarı (${info.keyEnv}) uygulama sitesinin Vercel projesinde tanımlı olmalı. Sohbet ekranındaki gizlilik notu da buna göre değişir.`}
      >
        <Select value={v.provider} onValueChange={(p) => setProvider(p as AiProvider)}>
          <SelectTrigger id="ai-provider" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDER_IDS.map((p) => (
              <SelectItem key={p} value={p}>
                {PROVIDER_OPTIONS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row id="ai-model" label="Model" help={info.modelHelp}>
        <Select value={v.model} onValueChange={(m) => set("model", m as AiModelId)}>
          <SelectTrigger id="ai-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelsOf(v.provider).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.hint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row id="ai-daily" label="Kişi başı günlük soru" help="1-500. Gece yarısı (Türkiye saati) yenilenir.">
        <Input id="ai-daily" type="number" inputMode="numeric" min={1} max={500} value={v.dailyMessages} onChange={(e) => set("dailyMessages", Number(e.target.value))} />
      </Row>
      <Row id="ai-minute" label="Kişi başı dakikalık soru" help="1-60. Art arda gönderimi sınırlar.">
        <Input id="ai-minute" type="number" inputMode="numeric" min={1} max={60} value={v.perMinute} onChange={(e) => set("perMinute", Number(e.target.value))} />
      </Row>
      <Row id="ai-budget" label="Günlük toplam bütçe (USD)" help="0-1000. Dolunca GebzemAI o gün herkese 'yarın tekrar dene' der. 0 = kapalı gibi.">
        <Input
          id="ai-budget"
          type="number"
          inputMode="decimal"
          min={0}
          max={1000}
          step={0.5}
          value={v.dailyBudgetUsd}
          onChange={(e) => set("dailyBudgetUsd", Number(e.target.value))}
        />
      </Row>
      <Button type="submit" disabled={pending || !dirty} className="mt-2 w-full">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Kaydet
      </Button>
    </form>
  );
}
