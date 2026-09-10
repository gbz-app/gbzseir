# Uygulama iskeleti sözleşmesi (App-shell contract)

Foundation app-shell agent çıktısı, 2026-09-10.

ALL paths are under src/ (alias @/). "client" means the module has "use client". Every user-facing string is Turkish.

=== CONFIG ===
@/config/site: APP_NAME='Gebzem' (the ONLY brand constant), APP_FULL_NAME, APP_TAGLINE, APP_DESCRIPTION, CITY {name,slug,province,center:{lat:40.8027,lng:29.4307},timezone}, SITE_URL, SUPPORT {phone,phoneDisplay,email}, BRAND_COLORS, OTP_DEMO_MODE, STORAGE_KEYS {onboarded:'gebzem.onboarded.v1', theme, visits, installDismissedAt, location, neighbourhood, marketingConsent, wizardDraftPrefix:'gebzem.draft.'}, MEDIA_BUCKET='media'.
@/config/sitemap-extra: type SitemapExtraSource = () => Promise<MetadataRoute.Sitemap>; export const sitemapExtraSources: SitemapExtraSource[] (append your source; failures are ignored).

=== DB CONTRACT (verified against the live DB) ===
@/lib/db-contract: TABLES {profiles, neighbourhoods, notifications, pushSubscriptions:'push_subscriptions', favorites, reports, businesses}; RPC {getDemoOtp, logContactEvent, revealListingPhone}; rpcArgs.*; STORAGE_BUCKETS.media.
Types:
- ContactEventKind = 'call_click'|'phone_reveal'|'directions'
- ContactSubjectType = 'listing'|'job'|'business'|'poi'|'lead' (pharmacy, mosque, stop and place are all 'poi')
- FavoriteTargetType = 'listing'|'business'|'poi'
- ReportTargetType = 'listing'|'business'|'review'|'user'
- ReportReasonValue = 'dolandiricilik'|'yanlis_kategori'|'uygunsuz'|'yaniltici'|'diger'
- RevealPhoneResult = {ok:true, phone, display_name?} | {ok:false, reason:'not_found'|'rate_limited'|'login_required'|'no_phone'}
@/lib/types: Profile, Neighbourhood {id,name,slug,district,lat,lng}, BusinessSummary {id,slug,name,status,owner_id,logo_url,kinds}, BusinessKind = 'service_provider'|'shop'|'employer', TargetType, NotificationPayload.
@/lib/database.types: the real generated Database type (owned by the DB agent).

=== SUPABASE CLIENTS / AUTH ===
- @/lib/supabase/client: createClient() -> browser singleton.
- @/lib/supabase/server: async createClient() (Next 16 async cookies; server-only).
- @/lib/supabase/admin: createAdminClient() (service role; server-only).
- src/proxy.ts refreshes the session only for requests that carry sb- cookies.
@/lib/auth/server (server-only; all make the route dynamic):
- getCurrentUser(), getProfile(), getMyBusinesses() (all React-cache'd)
- requireAuth(nextPath) -> redirects to /giris?next=
- requireProfile(nextPath) -> also sends not-onboarded users to /giris/profil
- requireAdmin() -> notFound() for non-admins
- isBusinessOwner({approvedOnly?})
- requireApprovedBusiness(nextPath) -> redirects to /isletme/tanitim
@/lib/auth/auth-provider (client): AuthProvider, useAuth() -> {user, loading, profile, profileLoading, refreshProfile(), signOut()}, useUser() -> {user, loading}, useProfile() -> {profile, loading, refresh}.
@/lib/auth/hooks (client): the hooks above plus useCurrentPath(), useRequireAuth() -> (nextPath?) => boolean (pushes to login when signed out), useMyBusinesses() -> {businesses, loading, isOwner, approved}.
@/lib/auth/otp (client): sendLoginOtp(phoneE164), verifyLoginOtp(phone, code) -> {error, userId}, sendPhoneChangeOtp(phone) (updateUser({phone})), verifyPhoneChangeOtp(phone, code) (type 'phone_change'), authErrorMessage(err, 'send'|'verify'), fetchDemoOtp(phone), MARKETING_CONSENT_SESSION_KEY. All return {error: string|null}; none throw.

=== CORE (pure TS, shareable with Expo) ===
- @/core/routes: routes.* builders for every route (nearby, listings, services, businesses, profile, business, content, legal, admin, auth.login/verify/profile), withQuery, safeNextPath, isRouteActive, PUBLIC_STATIC_ROUTES.
- @/core/format: formatPrice ('1.250 TL'), formatPriceRange, formatPhoneTR ('0532 123 45 67'), maskPhone ('5XX XXX XX 12'), formatDate/Time/DateTime/RelativeTime/DayLabel, truncate, initials, shortName.
- @/core/phone: normalizePhoneTR -> E.164, isValidTRMobile, formatPhoneInputTR, telHref, fromSupabasePhone.
- @/core/geo: distanceMeters, formatDistance, roundCoord / roundLatLng (3 decimals), googleDirectionsUrl, appleDirectionsUrl, isNear.
- @/core/duty: dutyDayFor (08:30 Europe/Istanbul switch), dutyWindowFor, currentDutyWindow, nextDutySwitch, isDutyActive, filterActiveDuties, describeDutyWindow.
- @/core/tr: trLower, trNormalize, trIncludes, slugifyTr, trCompare, trCapitalize.
- @/core/time: istanbulDateKey, addDaysToKey, istanbulDateTime.
- @/core/flow: FlowSchema, FlowStep, FlowAnswers, isStepVisible, visibleSteps, validateStep, validateAnswers (also run it on the server) -> {valid, errors, cleaned}, summarizeAnswers, parseFlowSchema.

=== LAYOUT / NAV ===
- The (main) layout renders TopBar only on /, /yakinimda, /ilanlar, /hizmetler and /profil. Every other page must render <PageHeader/>.
- BottomNav is hidden automatically on /ilan-ver*, /hizmet-talebi*, /isletme/basvuru* and /profil/telefon-degistir.
- @/components/layout/nav-visibility: <HideBottomNav/> (hides the nav while mounted), useBottomNavHidden(), useScrolled().
- Utilities in globals.css: pb-safe, pt-safe, pb-nav, bottom-nav-offset, tap-target, no-scrollbar; color tokens brand-soft, highlight(-soft/-foreground), success(-soft), info(-soft); shadows shadow-soft / shadow-card / shadow-float; animations animate-float, animate-pulse-ring, animate-pin-drop, animate-slide-up, animate-fade-in, animate-fly, animate-pop.
- Admin: the src/app/admin/layout.tsx guard is done. @/components/admin/admin-page exports AdminPageHeader {title, description?, actions?} and AdminPlaceholder. @/components/admin/admin-shell exports ADMIN_NAV.

=== SHARED COMPONENTS (@/components/shared/*) ===
- page-header (client): PageHeader {title, subtitle?, backHref?='/', hideBack?, onBack?, actions?, children? (extra row), sticky?=true, transparent?, hideBottomNav?}. Uses router.back() when there is in-app history, otherwise backHref.
- section-header: SectionHeader {title, description?, href?, linkLabel?='Tümü', as?, action?}.
- empty-state (server-safe): EmptyState {icon?: LucideIcon, illustration?, title, description?, actionLabel?, actionHref?, action?, tone?:'default'|'brand'|'warning', compact?}.
- error-state (client): ErrorState {title?, description?, onRetry? (default router.refresh), retryLabel?, offline?, compact?}.
- skeletons: ListSkeleton {count?, variant?:'row'|'card'|'media'|'grid'}, CardSkeleton {withImage?}, PageSkeleton {variant?}.
- chip-filter (client): ChipFilter<T> {options: ChipOption<T>[] ({value, label, icon?, count?, disabled?}), ariaLabel?, bleed?=true, size?} plus either {value: T|null, onChange, allowDeselect?} or {multiple: true, value: T[], onChange}.
- bottom-sheet (client): BottomSheet {open?, onOpenChange?, trigger?, title, description?, hideHeader?, children, footer?, fullHeight?, dismissible?, repositionInputs?, className?, bodyClassName?}; BottomSheetClose.
- neighbourhood-picker (client): NeighbourhoodPicker {value?: id, onChange?(n: Neighbourhood|null), open?, onOpenChange?, showTrigger?=true, placeholder?, title?, persistDefault?=true, allowClear?, showUseLocation?, onLocationUsed?, id?, invalid?, disabled?}.
- location-chip (client): LocationChip (top bar).
- @/lib/location/use-approx-location (client): useApproxLocation() -> {coords|null (rounded), updatedAt, status: 'idle'|'locating'|'granted'|'denied'|'unavailable'|'error', error, request(): Promise<LatLng|null> (call ONLY from a tap), clear(), neighbourhood, point (GPS, else neighbourhood centroid, else city center), pointSource, isSupported}.
- @/lib/location/store: useLocationPrefs, getDefaultNeighbourhood, setDefaultNeighbourhood, setApproxCoords, clearLocationPrefs.
- @/lib/neighbourhoods: useNeighbourhoods() -> {neighbourhoods, loading, error, reload}, loadNeighbourhoods().
- call-button (client): CallButton {phone, subjectType: ContactSubjectType, subjectId: uuid, label?='Ara', showNumber?, iconOnly?, variant?='success', size?, fullWidth?, onCall?}. Logs call_click with keepalive, then tel:+90…. On desktop it shows the number in a popover with a copy button.
- reveal-phone-button (client): RevealPhoneButton {listingId, label?, subjectType?:'listing'|'job', onRevealed?, fullWidth?}. Handles every RevealPhoneResult reason; login_required sends the user to /giris?next.
- directions-button (client): DirectionsButton {lat, lng, name?, label?, iconOnly?, variant?, size?, subjectType?, subjectId?} (logs 'directions' when a subject is given). Apple Maps on iOS, Google Maps elsewhere.
- share-button (client): ShareButton {title, text?, url?, label?, iconOnly?, variant?, size?}.
- favorite-button (client): FavoriteButton {targetType: FavoriteTargetType, targetId, initialFavorited?, variant?:'ghost'|'overlay', onChange?}. Guests are sent to /giris?next.
- report-sheet (client): ReportSheet {targetType: ReportTargetType, targetId, open?, onOpenChange?, trigger?, reasons?}; DEFAULT_REPORT_REASONS. Inserts reports {reporter_id, target_type, target_id, reason, detail}.
- image-uploader (client): ImageUploader {value: UploadedImage[], onChange, max?=8, folder?, fileNamePrefix?, variant?:'grid'|'avatar', label?, hint?, disabled?, onUploadingChange?}. UploadedImage = {url, thumbUrl, path, thumbPath, width?, height?}; the first item is the cover. Files go to media/<uid>/<folder>/<uuid>.webp plus _thumb (JPEG fallback on older iOS). Supporting helpers: @/lib/images processImage and uuid.
- auth-gate (client): AuthGate {children, next?, redirect?, requireProfile?, title?, description?, fallback?}. Server pages should use requireAuth/requireProfile instead.
- price-text: PriceText {amount? | min?/max?, fallback?, suffix?}.
- relative-time (client): RelativeTime {date, prefix?, refreshMs?}.
- badges: DutyBadge, VerifiedBadge, DemoBadge ('Örnek veri'), BusinessBadge, OpenStatusBadge {open}, PendingBadge (all accept {label?, className?}).
- demo-data-banner: DemoDataBanner {title?, children?, compact?}.
- data-source-note: DataSourceNote {source, sourceUrl?, updatedAt?, callAhead? (shows 'Gitmeden önce arayın.'), note?}.
- coming-soon: ComingSoon {title, description?, icon?, backHref?, withHeader?}.
- @/components/seo/json-ld: JsonLd {data}.
- @/components/theme/theme-toggle (client): ThemeToggle {variant?:'segmented'|'icon'}; @/components/theme/theme-provider useTheme().
- @/components/brand/logo: Logo, LogoMark.

=== WIZARD (@/components/wizard, client) ===
- Wizard<T extends object> {steps: WizardStep<T>[], initialData, draftKey? (autosaves to 'gebzem.draft.<key>'), onComplete(data) => string | void (return an error string to stay on the step; on success navigate yourself; the draft is cleared), completeLabel?='Gönder', title?, exitHref?, onExit?, onDataChange?}.
- WizardStep<T> {id, title, help?, isVisible?(d), validate?(d) => string|null|Promise, render(ctx), hideFooter? (boolean | fn), nextLabel?}.
- ctx = {data, setData(patch | updater), next(), back(), goTo(id), index, count, isLast, error, submitting}.
- The step is synced to ?adim=N (browser back works), the progress bar counts only visible steps, the bottom nav is hidden, and the header shows 'Baştan başla' when a draft was restored.
- StepShell {title, help?, children}.
- QuestionRenderer {step: FlowStep, value, onChange, onAutoAdvance?, error?, autoFocus?} ('single' auto-advances after 220 ms).
- buildFlowSteps(schema, {getAnswers(d), setAnswers(d, a), idPrefix?='q_'}) -> WizardStep[].
- clearWizardDraft / readWizardDraft / writeWizardDraft.

=== AUTH COMPONENTS (@/components/auth, client; for /profil/telefon-degistir) ===
- PhoneForm {onSubmit(phoneE164, {marketingConsent}) => string|void, submitLabel?='Kod Gönder', label?, defaultPhone?, showConsents?, autoFocus?}.
- OtpForm {phone, onVerify(code) => string|void, onResend() => string|void, resendAfter?=60, demoMode?=OTP_DEMO_MODE, submitLabel?}. Has WebOTP, autocomplete one-time-code, auto-submit and the countdown.
- DemoOtpBanner {phone, nonce?, onFill}.
- Phone change = PhoneForm -> sendPhoneChangeOtp, then OtpForm -> verifyPhoneChangeOtp.

=== ONBOARDING / PWA ===
- @/features/onboarding: OnboardingGate (already mounted in the (main) layout), OnboardingPreScript (root head), resetOnboarding() (then router.push('/')), isOnboarded, markOnboarded, useOnboardingActive.
- @/components/pwa/install-prompt (client): InstallPrompt (mounted in the (main) layout), InstallGuideSheet, openInstallGuide().
- @/lib/pwa/install-store: promptInstall, useInstallState.
- @/lib/push/client (client): getPushState() -> 'unsupported'|'ios-needs-install'|'default'|'granted'|'denied'; subscribePush() (call ONLY from a tap; upserts push_subscriptions on endpoint) -> {ok} or {ok:false, reason, message}; unsubscribePush(); isPushSubscribed(); sendTestPush().
- @/lib/notify (server-only): notifyUser(userId, {type, title, body, link?}) -> {notificationId, pushed, removed, failed}. Inserts a notifications row with the service role, pushes to every subscription, deletes 404/410 subscriptions. sendPushToUser also exported. Never put personal data in title/body.
- POST /api/push/test (auth required, throttled).
- Unread count: @/lib/notifications/use-unread-notifications -> useUnreadNotifications(), refreshUnreadNotifications().
- @/lib/contact: logContactEvent({subjectType, subjectId, event?}).
- @/lib/platform: isIOS, isIOSSafari, isAndroid, isStandalone, isMobileDevice, prefersReducedMotion.
- @/lib/storage: readString/writeString/readJSON/writeJSON/removeItem (all try/catch).
- @/lib/use-is-client: useIsClient().
- @/lib/navigation-history: canGoBack().

=== SERVICE WORKER (public/sw.js) ===
- Navigations are network-first with a 3 s timeout; only public pages are cached (/, /nobetci-eczane, detail pages, ilanlar, hizmetler, firma, haberler, yasal ...); fallback is /offline.
- Never cached: /api, /giris, /admin, /profil, /isletme, /talep, /ilan-ver, /hizmet-talebi, cross-origin requests (Supabase), RSC requests, requests with Authorization, POSTs.
- Any page can opt out with the response header 'X-SW-Cache: no'.
- Public JSON placed under /data/* is served stale-while-revalidate.
- The page sends CLEAR_PAGES on sign-out.
- Bump VERSION on every edit of sw.js.

=== RULES FOR FEATURE AGENTS ===
- Build every internal URL with the routes builders.
- Contact is only via CallButton / RevealPhoneButton (no messaging).
- Guest actions: useRequireAuth() on the client, requireAuth(next) on the server.
- The nöbetçi page may be served from cache offline, so filter duty rows on the client at render time with isDutyActive (or send X-SW-Cache: no) so an expired duty window is never shown.
