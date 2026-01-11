export const DOMAIN = "city_visitor_parking";

export const errorMessage = (
  err: unknown,
  fallbackKey: string,
  localizeFn: (key: string, ...args: Array<string | number>) => string,
): string => {
  const message = (err as { message?: unknown })?.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  const dataMessage = (err as { data?: { message?: unknown } })?.data?.message;
  if (typeof dataMessage === "string" && dataMessage.trim()) {
    return dataMessage;
  }
  return localizeFn(fallbackKey);
};

export const pad = (value: number | string): string =>
  String(value).padStart(2, "0");

export const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const formatTime = (date: Date): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

export const formatDateTimeLocal = (date: Date): string =>
  `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const isInEditor = (startNode: Node): boolean => {
  const selector =
    "hui-card-preview, hui-card-picker, hui-card-element-editor, " +
    "hui-card-edit-mode, hui-dialog-edit-card";
  let node: Node | null = startNode;
  while (node) {
    if (node instanceof HTMLElement && node.matches(selector)) {
      return true;
    }
    if (node instanceof HTMLElement && node.assignedSlot) {
      node = node.assignedSlot;
      continue;
    }
    const root = node.getRootNode?.();
    if (root instanceof ShadowRoot) {
      node = root.host;
      continue;
    }
    node = node.parentNode;
  }
  return false;
};

export const registerCustomCard = (
  cardType: string,
  ctor: CustomElementConstructor,
  name: string,
  description: string,
): void => {
  const scopedRegistry = (
    window as Window & { __scopedElementsRegistry?: CustomElementRegistry }
  ).__scopedElementsRegistry;
  const registries = new Set(
    [customElements, scopedRegistry].filter(
      (registry): registry is CustomElementRegistry => Boolean(registry),
    ),
  );
  for (const registry of registries) {
    if (!registry.get(cardType)) {
      registry.define(cardType, ctor);
    }
  }

  const win = window as Window & {
    customCards?: Array<{ type: string; name: string; description: string }>;
  };
  win.customCards = win.customCards || [];
  const existing = win.customCards.find((card) => card.type === cardType);
  if (existing) {
    existing.name = name;
    existing.description = description;
    return;
  }
  win.customCards.push({ type: cardType, name, description });
};
