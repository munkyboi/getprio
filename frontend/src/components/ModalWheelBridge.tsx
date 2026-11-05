import { useEffect } from "react";
import { installModalWheelBridge } from "../../../shared/modalWheel";

export default function ModalWheelBridge() {
  useEffect(() => installModalWheelBridge(), []);

  return null;
}
