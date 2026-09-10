import { createContext, forwardRef, useContext } from "react";
import {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "../button/button";
import type { BannerVariant } from "./banner";
export type BannerActionSize = Extract<ButtonSize, "xs" | "sm">;
export type BannerActionVariant = ButtonVariant;
export type BannerActionProps = ButtonProps;
export const BannerActionContext = createContext<{
  variant: BannerVariant;
  size: BannerActionSize;
}>({ variant: "default", size: "sm" });
export const BannerAction = forwardRef<HTMLButtonElement, BannerActionProps>(
  function BannerAction(props, ref) {
    const { size } = useContext(BannerActionContext);
    return <Button ref={ref} size={size} {...props} />;
  },
);
