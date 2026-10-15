# Local image runtime acceptance

This work is restricted to the disposable local demo and requires `--local-image-storage` on the canonical loopback launcher. External provider credentials remain empty and outbound networking stays blocked. The storage adapter independently verifies the actual disposable database and fixture marker; its files must live under an owned private database-specific namespace. No production activation or PR is authorized before preview approval.

| Image flow | Existing backend path | Required evidence | Status |
| --- | --- | --- | --- |
| Avatar | account profile/avatar | Real picker upload, persisted profile, rendered image after reload | Pending |
| Business image | Identify actual vendor UI save/upload path | Real picker upload, entity save, rendered image after reload | Pending |
| Location image | vendor location-media/uploads/direct | Real picker upload, location save, rendered image after reload | Pending |
| Service image | vendor service-media/uploads/direct | Real picker upload, service save, rendered image after reload | Pending |
| Board theme | vendor public-board-theme/uploads/direct | Real picker upload, theme save, rendered image after reload | Pending |
| Payment QR | vendor location payment-qr direct routes | Real picker upload, payment settings save, rendered image after reload | Pending |
| Payment proof | account booking payment-proof direct route | Real authorized booking upload/save; authenticated proof download; public asset read denied | Pending |

The browser acceptance must also verify resizing under the live Platform byte policy and errors/toasts above open dialogs. Unsupported formats and oversized bytes remain rejected by the server. Generic configuration errors must not expose environment variable names or filesystem paths.

The queue runtime owner integrates only tested commits, restarts only after Vendor mutation HOLD, and confirms health/authenticated reads, exact fixture identity, storage isolation and unchanged active allocations. Browser acceptance belongs in a separate tab; preserve the user's current page and settings context. Never infer all-image acceptance from helper tests or a single successful QR upload.
