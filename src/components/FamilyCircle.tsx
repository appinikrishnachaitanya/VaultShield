import {useEffect,useState,type Dispatch,type SetStateAction} from 'react';
import {Users,Copy,Trash2,Bell,Check} from 'lucide-react';
import {t,useAppLanguage} from '../lib/i18n';
import {createInvite,joinFamily,labelMember,removeMember,enableNotifications} from '../lib/firebase/family';
export type FamilyMember={id:string;name:string};
export type FamilyAlert={id:string;stages:number;senderName:string;time:number};
type Props={members:FamilyMember[];alerts:FamilyAlert[];busy:string;task:(label:string,fn:()=>Promise<void>)=>Promise<void>;setNotice:Dispatch<SetStateAction<string>>;notificationsReady:boolean;setNotificationsReady:Dispatch<SetStateAction<boolean>>};
export default function FamilyCircle({members,alerts,busy,task,setNotice,notificationsReady,setNotificationsReady}:Props){
 const appLanguage=useAppLanguage();
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [familyName, setFamilyName] = useState(() => {
    try { return localStorage.getItem("vaultshield-family-name") || ""; }
    catch { return ""; }
  });
  const [memberLabels, setMemberLabels] = useState<Record<string,string>>({});
  useEffect(() => {
    const update = () => {
      try { setFamilyName(localStorage.getItem('vaultshield-family-name') || ''); } catch { /* Optional cache. */ }
    };
    window.addEventListener('vaultshield-profile', update);
    return () => window.removeEventListener('vaultshield-profile', update);
  }, []);
  const [editingMember, setEditingMember] = useState<string | null>(null);

 return (<>
              <div className="page-heading">
                <span className="eyebrow">
                  {t("A TRUSTED SECOND PAIR OF EYES")}
                </span>
                <h1>
                  {t(" Your family ")}
                  <span>{t("circle.")}</span>
                </h1>
                <p>{t("Ask for help without sharing your private message.")}</p>
              </div>
              <div className="family-layout">
                <section className="card">
                  <h2>{t("Connect someone you trust")}</h2>
                  <p>
                    {t(
                      "Enter your name, then create an invitation or join with a code.",
                    )}
                  </p>
                  <label htmlFor="family-name">{t("Your name in the family")}</label>
                  <input
                    id="family-name"
                    value={familyName}
                    maxLength={40}
                    onChange={(event) => setFamilyName(event.target.value)}
                    placeholder={t("For example, Mum or Ravi")}
                  />
                  <label htmlFor="family-code">{t("Invitation code (only to join)")}</label>
                  <input
                    id="family-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("Paste your family member’s code")}
                  />
                  <div className="family-actions">
                    <button
                      className="primary"
                      disabled={!!busy || familyName.trim().length < 2}
                      onClick={() =>
                        void task("Creating invite", async () => {
                          try { localStorage.setItem("vaultshield-family-name", familyName.trim()); } catch { /* Optional preference. */ }
                          setInvite((await createInvite(familyName)).code);
                        })
                      }
                    >
                      <Users size={18} />
                      {t(" Create invitation ")}
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy || !code.trim() || familyName.trim().length < 2}
                      onClick={() =>
                        void task("Joining family", async () => {
                          await joinFamily(code, familyName);
                          try { localStorage.setItem("vaultshield-family-name", familyName.trim()); } catch { /* Optional preference. */ }
                          setCode("");
                          setNotice("Family connection established.");
                        })
                      }
                    >
                      {t(" Join family circle ")}
                    </button>
                  </div>
                  {familyName.trim().length < 2 && (
                    <p className="field-hint" role="status">
                      {t("Enter your name above (at least 2 characters) to continue.")}
                    </p>
                  )}
                  {invite && (
                    <div className="invite-code">
                      <p>{t("Share this code with up to 9 relatives. It expires in 10 minutes.")}</p>
                      <code>{invite}</code>
                      <button
                        className="secondary"
                        onClick={() =>
                          void task("Copying invitation", async () => {
                            await navigator.clipboard.writeText(invite);
                            setNotice("Invitation copied. Share it privately with your family member.");
                          })
                        }
                      >
                        <Copy size={16} />
                        {t(" Copy ")}
                      </button>
                    </div>
                  )}
                </section>
                <section className="card">
                  <h2>{t("People & notifications")}</h2>
                  <p>
                    {members.length
                      ? members.length === 1
                        ? t("1 person connected")
                        : `${members.length} ${t("people connected")}`
                      : t(
                          "No one paired yet. Create or accept an invitation to get started.",
                        )}
                  </p>
                  {members.map((m) => (
                    <div className="member" key={m.id}>
                      <Users size={20} />
                      <div className="member-details">
                        <strong>{m.name}</strong>
                        {editingMember === m.id && <>
                        <label htmlFor={`member-label-${m.id}`}>{t("Name you recognize")}</label>
                        <input
                          id={`member-label-${m.id}`}
                          value={memberLabels[m.id] ?? m.name}
                          maxLength={40}
                          autoFocus
                          onChange={(event) => setMemberLabels((labels) => ({...labels,[m.id]:event.target.value}))}
                        />
                        </>}
                      </div>
                      {editingMember === m.id ? <>
                      <button
                        type="button"
                        disabled={!!busy || (memberLabels[m.id] ?? m.name).trim().length < 2 || (memberLabels[m.id] ?? m.name).trim() === m.name}
                        onClick={() => void task("Saving name", async () => {
                          await labelMember(m.id, memberLabels[m.id]);
                          setEditingMember(null);
                          setNotice("Family member name saved.");
                        })}
                      >{t("Save name")}</button>
                      <button type="button" disabled={!!busy} onClick={() => setEditingMember(null)}>{t("Cancel")}</button>
                      </> : <button type="button" disabled={!!busy} onClick={() => {
                        setMemberLabels((labels) => ({ ...labels, [m.id]: m.name }));
                        setEditingMember(m.id);
                      }}>{t("Rename")}</button>}
                      <button
                        disabled={!!busy}
                        aria-label={`${t("Remove")} ${m.name}`}
                        onClick={() =>
                          void task("Removing connection", async () => {
                            await removeMember(m.id);
                          })
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="secondary"
                    disabled={!!busy || notificationsReady}
                    onClick={() =>
                      void task("Enabling notifications", async () => {
                        await enableNotifications();
                        setNotificationsReady(true);
                        setNotice("Notifications enabled on this device.");
                      })
                    }
                  >
                    {notificationsReady ? <Check size={18} /> : <Bell size={18} />}
                    {t(notificationsReady ? "Notifications enabled" : "Enable notifications")}
                  </button>
                  <h3 className="inbox-title">{t("Help requests")}</h3>
                  {alerts.length ? (
                    alerts.map((a) => (
                      <div className="alert-item" key={a.id}>
                        <Bell size={18} />
                        <span>
                          <strong>{a.senderName} {t("asked for help")}</strong>
                          <br />
                          <small>{a.time ? `${new Date(a.time).toLocaleString(appLanguage === "hi" ? "hi-IN" : "en-IN")} · ` : ""}{a.stages}{t("/4 stages ")}</small>
                          <br />
                          <small>
                            {t(
                              " Call this person using the number already saved in your contacts. No message or phone number was shared here. ",
                            )}
                          </small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-note">
                      {t("No help requests for this account yet.")}
                    </p>
                  )}
                </section>
              </div>
            </>);
}
