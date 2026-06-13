import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase";
import { ALLOWED_EMAIL } from "./lib/config";
import { ensureUserDoc, useUserDoc, useIntegrations, useDayBundle, useTodayFood, buildTimeline, useMediaQuery } from "./lib/data";
import { dateKey, greeting, prettyDate } from "./lib/dates";
import { IconGrid, IconTrend, IconBowl, IconSpark, IconUser, IconClock, IconRing } from "./components/Icons";
import { Timeline } from "./components/Widgets";
import Dashboard from "./views/Dashboard";
import Trends from "./views/Trends";
import Nutrition from "./views/Nutrition";
import Coach from "./views/Coach";
import Profile from "./views/Profile";

type View = "dashboard" | "trends" | "nutrition" | "coach" | "profile" | "timeline";

const DESKTOP_NAV: { key: View; name: string; icon: JSX.Element }[] = [
  { key: "dashboard", name: "Dashboard", icon: <IconGrid /> },
  { key: "trends", name: "Trends", icon: <IconTrend /> },
  { key: "nutrition", name: "Nutrition", icon: <IconBowl /> },
  { key: "coach", name: "Coach", icon: <IconSpark /> },
  { key: "profile", name: "Profile", icon: <IconUser /> },
];

const MOBILE_TABS: { key: View; name: string; icon: JSX.Element }[] = [
  { key: "timeline", name: "Timeline", icon: <IconClock size={21} /> },
  { key: "nutrition", name: "Log", icon: <IconBowl size={21} /> },
  { key: "trends", name: "Trends", icon: <IconTrend size={21} /> },
  { key: "profile", name: "You", icon: <IconUser size={21} /> },
];

const TITLES: Record<View, { h: string; sub: string }> = {
  dashboard: { h: "", sub: "" }, // greeting computed at render
  trends: { h: "Trends", sub: "How your metrics have moved over the last 30 days" },
  nutrition: { h: "Nutrition", sub: "Log meals in plain language — Aura estimates the rest" },
  coach: { h: "Coaching", sub: "Personalized suggestions from Aura, your AI coach" },
  profile: { h: "Profile", sub: "Your weight, goals and connected devices" },
  timeline: { h: "Today", sub: "" },
};

function AuthGate({ onUser }: { onUser: (u: User) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      onUser(cred.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Aura</h1>
        <div className="label" style={{ marginBottom: 22 }}>Health OS</div>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 24 }}>
          Your private food & activity tracker. Sign in with the Google account this instance is locked to.
        </p>
        <button className="btn-grad" style={{ width: "100%" }} onClick={signIn} disabled={busy}>
          {busy ? "Opening Google…" : "Sign in with Google"}
        </button>
        {error && <div style={{ color: "#f87171", fontSize: 12, marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

function NotAllowed({ email }: { email: string }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Aura</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: "18px 0 22px" }}>
          <b style={{ color: "var(--text)" }}>{email}</b> isn't authorized for this private instance.
        </p>
        <button className="btn-ghost" style={{ width: "100%" }} onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function MobileTimeline({ uid }: { uid: string }) {
  const today = dateKey();
  const bundle = useDayBundle(uid, today);
  const todayFood = useTodayFood(uid);
  const events = useMemo(() => buildTimeline({ ...bundle, food: todayFood }), [bundle, todayFood]);
  return (
    <div className="card">
      <div className="label">Today's timeline</div>
      <Timeline events={events} empty="Nothing yet today — log a meal or wait for the next Oura sync." />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [view, setView] = useState<View>("dashboard");
  const [rangeDays, setRangeDays] = useState(30);
  const [online, setOnline] = useState(navigator.onLine);
  const [ouraToast, setOuraToast] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("oura") === "connected") {
      setOuraToast(true);
      setView("profile");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setOuraToast(false), 4000);
    }
  }, []);
  useEffect(() => {
    // Mobile has no Dashboard tab; desktop has no Timeline item.
    if (isMobile && view === "dashboard") setView("timeline");
    if (!isMobile && view === "timeline") setView("dashboard");
  }, [isMobile, view]);
  useEffect(() => {
    if (user?.email && user.email.toLowerCase() === ALLOWED_EMAIL.toLowerCase()) {
      ensureUserDoc(user.uid, user.email, user.displayName ?? "You");
    }
  }, [user]);

  if (user === undefined) {
    return <div className="auth-wrap"><div className="spinner" /></div>;
  }
  if (!user) return <AuthGate onUser={() => {}} />;
  if (!user.email || user.email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    return <NotAllowed email={user.email ?? "(no email)"} />;
  }

  return <Shell uid={user.uid} displayName={user.displayName ?? "You"} email={user.email}
    view={view} setView={setView} rangeDays={rangeDays} setRangeDays={setRangeDays}
    online={online} ouraToast={ouraToast} isMobile={isMobile} />;
}

function Shell(props: {
  uid: string; displayName: string; email: string;
  view: View; setView: (v: View) => void;
  rangeDays: number; setRangeDays: (n: number) => void;
  online: boolean; ouraToast: boolean; isMobile: boolean;
}) {
  const { uid, displayName, view, setView, rangeDays, setRangeDays, online, ouraToast } = props;
  const userDoc = useUserDoc(uid);
  const integrations = useIntegrations(uid);
  const oura = integrations.find((i) => i.provider === "oura");
  const firstName = (userDoc?.name ?? displayName).split(" ")[0];
  const initials = (userDoc?.name ?? displayName).split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  if (!userDoc) {
    return <div className="auth-wrap"><div className="spinner" /></div>;
  }

  const t = TITLES[view];
  const heading = view === "dashboard" ? `${greeting()}, ${firstName}` : t.h;
  const sub = view === "dashboard" ? prettyDate(dateKey()) : t.sub;
  const showRange = view === "dashboard" || view === "trends";

  return (
    <div className="shell">
      {!online && <div className="offline-pill">Offline — changes will sync when you're back</div>}
      {ouraToast && <div className="offline-pill" style={{ background: "rgba(52,211,153,0.15)", color: "var(--emerald)", borderColor: "rgba(52,211,153,0.35)" }}>Oura connected — first sync running</div>}

      <aside className="sidebar">
        <div className="brand">
          <h1>Aura</h1>
          <div className="label">Health OS</div>
        </div>
        <nav className="nav">
          {DESKTOP_NAV.map((n) => (
            <button key={n.key} className={view === n.key ? "active" : ""} onClick={() => setView(n.key)}>
              {n.icon} {n.name}
            </button>
          ))}
        </nav>
        <div className="oura-card">
          <div style={{ display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700 }}>
            <span className={`dot ${oura?.status === "connected" ? "on" : "off"}`} />
            Oura {oura?.status === "connected" ? "connected" : "not connected"}
          </div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
            {oura?.status === "connected" ? "Sleep & activity syncing every 4h" : "Connect it from Profile"}
          </div>
        </div>
        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userDoc.name}</div>
            <div className="faint" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.email}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="header">
          <div>
            <h2>{heading}</h2>
            <div className="sub">{sub}</div>
          </div>
          <div className="grow" />
          {showRange && (
            <div className="segmented">
              {([["Week", 7], ["Month", 30], ["Year", 365]] as const).map(([name, n]) => (
                <button key={name} className={rangeDays === n ? "active" : ""} onClick={() => setRangeDays(n)}>{name}</button>
              ))}
            </div>
          )}
          <button className="btn-grad hide-mobile" onClick={() => setView("nutrition")}>Log food</button>
        </div>

        {view === "dashboard" && <Dashboard uid={uid} user={userDoc} rangeDays={rangeDays} />}
        {view === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <MobileTimeline uid={uid} />
            <Dashboard uid={uid} user={userDoc} rangeDays={rangeDays} />
          </div>
        )}
        {view === "trends" && <Trends uid={uid} rangeDays={rangeDays} />}
        {view === "nutrition" && <Nutrition uid={uid} user={userDoc} />}
        {view === "coach" && <Coach uid={uid} />}
        {view === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Profile uid={uid} user={userDoc} />
            <div className="hide-desktop">
              <button className="btn-ghost" style={{ width: "100%" }} onClick={() => setView("coach")}>
                Open AI Coach
              </button>
            </div>
            <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => signOutClick()}>
              Sign out
            </button>
          </div>
        )}
        {view === "coach" && props.isMobile && (
          <div style={{ marginTop: 14 }}>
            <button className="btn-ghost" onClick={() => setView("profile")}>← Back to You</button>
          </div>
        )}
      </main>

      <nav className="tabbar">
        {MOBILE_TABS.map((tb) => (
          <button
            key={tb.key}
            className={view === tb.key || (tb.key === "profile" && view === "coach") ? "active" : ""}
            onClick={() => setView(tb.key)}
          >
            {tb.icon}
            {tb.name}
          </button>
        ))}
      </nav>
    </div>
  );
}

function signOutClick() {
  void signOut(auth);
}

// Keep the unused import referenced for the sidebar's Oura iconography option.
void IconRing;
