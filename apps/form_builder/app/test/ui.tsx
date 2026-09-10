import type { ReactNode } from "react";
import type { RenderOptions } from "@testing-library/react";
import {
  render as baseRender,
  renderHook as baseRenderHook,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmationProvider } from "../component/ui/dialog";
export * from "@testing-library/react";
export const render = (ui: ReactNode, options?: RenderOptions) =>
  baseRender(ui, { wrapper: ConfirmationProvider, ...options });
export const renderHook: typeof baseRenderHook = (callback, options) =>
  baseRenderHook(callback, { wrapper: ConfirmationProvider, ...options });
export async function respondToConfirmation(name: string | RegExp) {
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
}
