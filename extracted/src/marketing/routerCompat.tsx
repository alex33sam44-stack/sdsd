import React from "react";
import {
  Link as RouterLink,
  useNavigate as useReactRouterNavigate,
  useParams as useReactRouterParams,
} from "react-router-dom";

type ToInput = string | { to?: string; href?: string; search?: string | Record<string, string | number | boolean | undefined> };

function normalizeTo(to: ToInput | undefined): string {
  if (!to) return "#";
  if (typeof to === "string") return to;
  const path = to.to || to.href || "#";
  if (!to.search) return path;
  if (typeof to.search === "string") return `${path}${to.search.startsWith("?") ? to.search : `?${to.search}`}`;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(to.search)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

export function Link({ to, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: ToInput }) {
  return <RouterLink to={normalizeTo(to)} {...props}>{children}</RouterLink>;
}

export function useNavigate() {
  const navigate = useReactRouterNavigate();
  return (next: ToInput | number) => {
    if (typeof next === "number") return navigate(next);
    return navigate(normalizeTo(next));
  };
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    navigate,
    invalidate: () => undefined,
  };
}

export function useParams(_opts?: unknown) {
  return useReactRouterParams();
}

export function createFileRoute(_path: string) {
  return <T extends { component?: React.ComponentType<unknown>; head?: unknown }>(config: T) => config;
}
