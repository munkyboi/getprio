# Store manual payment proof as private objects

Manual booking payment proof images can expose customer names, wallet/account fragments, transaction references, timestamps, and amounts. GetPrio will store these proof images as private/protected objects and expose them only through authenticated, role-scoped access for the booking customer, authorized vendor-side users, and platform administrators. This deliberately differs from public board theme uploads, which use public asset URLs because they are intended as public branding.
