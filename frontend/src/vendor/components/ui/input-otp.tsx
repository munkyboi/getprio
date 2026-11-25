import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "cn";

function InputOTP({ className, containerClassName, ...props }: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn("v:flex v:items-center v:has-disabled:opacity-50", containerClassName)}
      spellCheck={false}
      className={cn("v:disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-otp-group" className={cn("v:flex v:items-center v:rounded-lg v:has-aria-invalid:border-destructive v:has-aria-invalid:ring-3 v:has-aria-invalid:ring-destructive/20 v:dark:has-aria-invalid:ring-destructive/40", className)} {...props} />;
}

function InputOTPSlot({ index, className, ...props }: React.ComponentProps<"div"> & { index: number }) {
  const context = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = context?.slots[index] ?? {};
  return (
    <div data-slot="input-otp-slot" data-active={isActive} className={cn("v:relative v:flex v:h-10 v:w-10 v:items-center v:justify-center v:border-y v:border-r v:border-input v:text-base v:transition-all v:outline-none v:first:rounded-l-lg v:first:border-l v:last:rounded-r-lg v:aria-invalid:border-destructive v:data-[active=true]:z-10 v:data-[active=true]:border-ring v:data-[active=true]:ring-3 v:data-[active=true]:ring-ring/50 v:data-[active=true]:aria-invalid:border-destructive v:data-[active=true]:aria-invalid:ring-destructive/20 v:dark:bg-input/30 v:dark:data-[active=true]:aria-invalid:ring-destructive/40", className)} {...props}>
      {char}
      {hasFakeCaret ? <div className="v:pointer-events-none v:absolute v:inset-0 v:flex v:items-center v:justify-center"><div className="v:h-5 v:w-px v:animate-caret-blink v:bg-foreground v:duration-1000" /></div> : null}
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot };
