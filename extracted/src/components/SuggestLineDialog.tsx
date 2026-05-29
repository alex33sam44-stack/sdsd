import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send, X, Route } from "lucide-react";
import { submitLineSuggestion } from "@/modules/shared/services/cities";
import { toast } from "@/components/ui/sonner";

type Props = {
  defaultCity?: string;
  defaultCountryCode?: string | null;
  defaultCountryName?: string | null;
  onClose: () => void;
};

export const SuggestLineDialog = ({
  defaultCity,
  defaultCountryCode,
  defaultCountryName,
  onClose,
}: Props) => {
  const { t } = useTranslation();
  const [lineName, setLineName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [city, setCity] = useState(defaultCity ?? "");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineName.trim() || !from.trim() || !to.trim() || !city.trim()) return;
    setBusy(true);
    try {
      await submitLineSuggestion({
        line_name: lineName.trim(),
        from_point: from.trim(),
        to_point: to.trim(),
        city_name: city.trim(),
        country_code: defaultCountryCode ?? null,
        country_name: defaultCountryName ?? null,
        contact: contact.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(t("welcome.submitted"));
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("welcome.submitError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-secondary/60 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-surface rounded-2xl border-2 border-secondary shadow-tactile p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-primary border-2 border-secondary grid place-items-center">
              <Route className="w-5 h-5 text-secondary" strokeWidth={2.5} />
            </div>
            <h2 className="font-black text-secondary text-lg">{t("welcome.lineSuggestionTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="h-9 w-9 grid place-items-center rounded-lg border-2 border-secondary bg-surface text-secondary"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <Field label={t("welcome.fieldLine")} required>
          <input
            value={lineName}
            onChange={(e) => setLineName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("welcome.fieldFrom")} required>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              className={inputCls}
            />
          </Field>
          <Field label={t("welcome.fieldTo")} required>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label={t("welcome.fieldCity")} required>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            className={inputCls}
          />
        </Field>

        <Field label={t("welcome.fieldContact")}>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={120}
            className={inputCls}
          />
        </Field>

        <Field label={t("welcome.fieldNotes")}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            className={`${inputCls} h-auto resize-none`}
          />
        </Field>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} />
          ) : (
            <Send className="w-5 h-5" strokeWidth={2.5} />
          )}
          {t("welcome.submit")}
        </button>
      </form>
    </div>
  );
};

const inputCls =
  "w-full h-11 px-3 rounded-lg border-2 border-secondary bg-surface font-bold text-secondary shadow-tactile-sm focus:outline-none focus:ring-2 focus:ring-primary";

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1.5">
    <span className="text-sm font-black text-secondary">
      {label}
      {required && <span className="text-destructive ms-1">*</span>}
    </span>
    {children}
  </label>
);
