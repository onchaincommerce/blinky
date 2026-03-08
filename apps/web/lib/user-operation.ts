type UserOperationLike = {
  userOperationHash?: string;
  userOpHash?: string;
  transactionHash?: string;
};

export const extractOperationHash = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as UserOperationLike;
  if (typeof candidate.transactionHash === "string") {
    return candidate.transactionHash;
  }
  if (typeof candidate.userOperationHash === "string") {
    return candidate.userOperationHash;
  }
  if (typeof candidate.userOpHash === "string") {
    return candidate.userOpHash;
  }

  return null;
};
