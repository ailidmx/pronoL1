import React from "react";

export function Button({ children, ...props }) {
  return <button type="button" {...props}>{children}</button>;
}
