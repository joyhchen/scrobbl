export function requireEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}

export function requireButton(id: string): HTMLButtonElement {
  const el = requireEl(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Expected #${id} to be a <button>`);
  }
  return el;
}
