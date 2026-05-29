export type StreetImageryProvider = "kartaview" | "panoramax" | "custom";

export type StreetImageryLink = {
  provider: StreetImageryProvider;
  label: string;
  url: string;
  description: string;
};

function formatTemplate(template: string, lat: number, lng: number, zoom = 18) {
  return template
    .replaceAll("{lat}", String(lat))
    .replaceAll("{lng}", String(lng))
    .replaceAll("{zoom}", String(zoom));
}

export function getStreetImageryProvider(): StreetImageryProvider {
  const provider = (import.meta.env.VITE_STREET_IMAGERY_PROVIDER as string | undefined)?.trim().toLowerCase();
  if (provider === "panoramax" || provider === "custom") return provider;
  return "kartaview";
}

export function buildStreetImageryLink(lat: number, lng: number): StreetImageryLink {
  const provider = getStreetImageryProvider();
  const customTemplate = (import.meta.env.VITE_STREET_IMAGERY_URL_TEMPLATE as string | undefined)?.trim();

  if (customTemplate) {
    return {
      provider: "custom",
      label: "شوف الشارع",
      url: formatTemplate(customTemplate, lat, lng),
      description: "رابط street-level imagery مخصص من الإعدادات.",
    };
  }

  if (provider === "panoramax") {
    return {
      provider,
      label: "شوف الشارع على Panoramax",
      url: `https://panoramax.openstreetmap.fr/#map=18/${lat}/${lng}`,
      description: "Panoramax بديل حر/مفتوح وفيدرالي لصور مستوى الشارع عند توفر تغطية.",
    };
  }

  return {
    provider: "kartaview",
    label: "شوف الشارع على KartaView",
    url: `https://kartaview.org/map/@${lat},${lng},18z`,
    description: "KartaView هو الاسم الحالي لمشروع OpenStreetView/OpenStreetCam لصور مستوى الشارع.",
  };
}

export function buildStreetImageryFallbackText(input: { from: string; to: string }) {
  return `لو مفيش صور شارع هنا، بلّغ أو صوّر المكان وساعد ركاب خط ${input.from} - ${input.to}.`;
}
