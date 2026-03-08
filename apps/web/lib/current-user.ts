"use client";

import type { User } from "@coinbase/cdp-core";

export const getSmartAccount = (currentUser: User | null) =>
  (currentUser?.evmSmartAccountObjects?.[0]?.address ?? currentUser?.evmSmartAccounts?.[0] ?? null) as
    | `0x${string}`
    | null;

export const getUserEmail = (currentUser: User | null) =>
  currentUser?.authenticationMethods.email?.email ?? null;
