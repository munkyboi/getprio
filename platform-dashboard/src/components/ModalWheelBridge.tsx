import { useEffect } from "react";
import { installModalWheelBridge } from "../../../shared/modalWheel";

export function ModalWheelBridge() {
  useEffect(() => installModalWheelBridge(), []);

  return null;
}
