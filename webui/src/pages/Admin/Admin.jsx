import {useContext, useEffect, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {AuthContext} from "@/common/contexts/Auth";
import {BrandingContext} from "@/common/contexts/Branding";
import {jsonRequest, postRequest, putRequest, deleteRequest} from "@/common/utils/RequestUtil.js";
import Button from "@/common/components/Button";
import Input from "@/common/components/Input";
import SelectBox from "@/common/components/SelectBox";
import Dialog from "@/common/components/Dialog";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faUsers, faRobot, faPalette, faPlus, faTrash,
    faShieldAlt, faChalkboardTeacher, faKey, faCopy, faRightFromBracket, faUpload, faRotateLeft, faImage
} from "@fortawesome/free-solid-svg-icons";
import {motion} from "framer-motion";
import toast from "react-hot-toast";
import "./styles.sass";

const AI_PROVIDERS = [
    {value: '', label: 'Deaktiviert'},
    {value: 'openai', label: 'OpenAI'},
    {value: 'anthropic', label: 'Anthropic'},
    {value: 'google', label: 'Google'},
    {value: 'ollama', label: 'Ollama'}
];

export const Admin = () => {
    const {user, isAdmin, logout} = useContext(AuthContext);
    const {titleImg, logoImg, refreshBranding} = useContext(BrandingContext);
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('ai');
    const [settings, setSettings] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [aiProvider, setAiProvider] = useState('');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiModel, setAiModel] = useState('');
    const [aiBaseUrl, setAiBaseUrl] = useState('');
    const [aiModels, setAiModels] = useState([]);
    const [modelsLoading, setModelsLoading] = useState(false);

    const [unsplashAccessKey, setUnsplashAccessKey] = useState('');
    const [giphyApiKey, setGiphyApiKey] = useState('');

    const [brandName, setBrandName] = useState('');
    const [brandColor, setBrandColor] = useState('');
    const [brandImprint, setBrandImprint] = useState('');
    const [brandPrivacy, setBrandPrivacy] = useState('');

    const [logoPreview, setLogoPreview] = useState(null);
    const [titlePreview, setTitlePreview] = useState(null);

    const [showNewUserDialog, setShowNewUserDialog] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('teacher');
    const [newUserError, setNewUserError] = useState('');

    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [passwordResetUserId, setPasswordResetUserId] = useState(null);
    const [newPasswordValue, setNewPasswordValue] = useState('');

    const [apiKeys, setApiKeys] = useState([]);
    const [showNewApiKeyDialog, setShowNewApiKeyDialog] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyExpiry, setNewKeyExpiry] = useState('');
    const [newApiKeyError, setNewApiKeyError] = useState('');
    const [newKeyResult, setNewKeyResult] = useState(null);

    useEffect(() => {
        if (!isAdmin) {
            navigate('/');
            return;
        }
        loadSettings();
        loadUsers();
    }, [isAdmin, navigate]);

    useEffect(() => {
        if (!aiProvider) {
            setAiModels([]);
            return;
        }
        fetchModels(aiProvider, aiApiKey, aiBaseUrl);
    }, [aiProvider, aiApiKey, aiBaseUrl]);

    const fetchModels = async (provider, apiKey, baseUrl) => {
        setModelsLoading(true);
        try {
            const data = await postRequest('/admin/models', {provider, apiKey, baseUrl});
            setAiModels((data.models || []).map(m => ({value: m, label: m})));
        } catch {
            setAiModels([]);
        } finally {
            setModelsLoading(false);
        }
    };

    const loadSettings = async () => {
        try {
            const data = await jsonRequest('/admin/settings');
            setSettings(data);
            setAiProvider(data.config?.ai?.provider || '');
            setAiApiKey(data.config?.ai?.apiKey || '');
            setAiModel(data.config?.ai?.model || '');
            setAiBaseUrl(data.config?.ai?.baseUrl || '');
            setUnsplashAccessKey(data.config?.media?.unsplashAccessKey || '');
            setGiphyApiKey(data.config?.media?.giphyApiKey || '');
            setBrandName(data.branding?.name || '');
            setBrandColor(data.branding?.color || '');
            setBrandImprint(data.branding?.imprint || '');
            setBrandPrivacy(data.branding?.privacy || '');
        } catch (error) {
            toast.error('Einstellungen konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    };

    const loadUsers = async () => {
        try {
            const data = await jsonRequest('/admin/users');
            setUsers(data.users || []);
        } catch (error) {
            toast.error('Benutzer konnten nicht geladen werden.');
        }
    };

    const loadApiKeys = async () => {
        if (!user?.id) return;
        try {
            const data = await jsonRequest(`/admin/users/${user.id}/api-keys`);
            setApiKeys(data.keys || []);
        } catch {
            setApiKeys([]);
        }
    };

    useEffect(() => {
        if (activeTab === 'apiKeys' && user?.id) loadApiKeys();
    }, [activeTab]);

    const createApiKey = async () => {
        if (!newKeyName.trim()) {
            setNewApiKeyError('Name ist erforderlich.');
            return;
        }

        try {
            const result = await postRequest(`/admin/users/${user.id}/api-keys`, {
                name: newKeyName.trim(),
                expiresAt: newKeyExpiry ? new Date(newKeyExpiry).toISOString() : undefined
            });
            setNewKeyResult(result);
            setShowNewApiKeyDialog(false);
            setNewKeyName('');
            setNewKeyExpiry('');
            setNewApiKeyError('');
            loadApiKeys();
        } catch (error) {
            setNewApiKeyError(error.message || 'Fehler beim Erstellen.');
        }
    };

    const revokeApiKey = async (keyId) => {
        try {
            await deleteRequest(`/admin/users/${user.id}/api-keys/${keyId}`);
            toast.success('API-Schlüssel widerrufen.');
            loadApiKeys();
        } catch (error) {
            toast.error(error.message || 'Fehler beim Widerrufen.');
        }
    };

    const copyKey = async (key) => {
        try {
            await navigator.clipboard.writeText(key);
            toast.success('API-Schlüssel kopiert.');
        } catch {
            toast.error('Kopieren fehlgeschlagen. Bitte manuell markieren.');
        }
    };

    const saveAiSettings = async () => {
        try {
            await putRequest('/admin/settings', {
                config: {ai: {provider: aiProvider, apiKey: aiApiKey, model: aiModel, baseUrl: aiBaseUrl}}
            });
            toast.success('KI-Einstellungen gespeichert.');
        } catch (error) {
            toast.error(error.message || 'Fehler beim Speichern.');
        }
    };

    const saveMediaSettings = async () => {
        try {
            await putRequest('/admin/settings', {
                config: {media: {unsplashAccessKey, giphyApiKey}}
            });
            toast.success('Medien-Einstellungen gespeichert.');
        } catch (error) {
            toast.error(error.message || 'Fehler beim Speichern.');
        }
    };

    const saveBrandingSettings = async () => {
        try {
            await putRequest('/admin/settings', {
                branding: {name: brandName, color: brandColor, imprint: brandImprint, privacy: brandPrivacy}
            });
            toast.success('Branding gespeichert. Änderungen werden nach einem Neustart wirksam.');
        } catch (error) {
            toast.error(error.message || 'Fehler beim Speichern.');
        }
    };

    const handleImageSelect = (type, e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Bild ist zu groß (max. 5 MB).');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            if (type === 'logo') setLogoPreview(reader.result);
            else setTitlePreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const uploadImage = async (type) => {
        const image = type === 'logo' ? logoPreview : titlePreview;
        if (!image) return;

        try {
            await putRequest(`/admin/branding/${type}`, {image});
            toast.success(`${type === 'logo' ? 'Logo' : 'Banner'} hochgeladen.`);
            if (type === 'logo') setLogoPreview(null);
            else setTitlePreview(null);
            refreshBranding?.();
        } catch (error) {
            toast.error(error.message || 'Fehler beim Hochladen.');
        }
    };

    const resetImage = async (type) => {
        try {
            await deleteRequest(`/admin/branding/${type}`);
            toast.success(`${type === 'logo' ? 'Logo' : 'Banner'} zurückgesetzt.`);
            if (type === 'logo') setLogoPreview(null);
            else setTitlePreview(null);
            refreshBranding?.();
        } catch (error) {
            toast.error(error.message || 'Fehler beim Zurücksetzen.');
        }
    };

    const createUser = async () => {
        if (!newUsername.trim() || !newPassword) {
            setNewUserError('Alle Felder sind erforderlich.');
            return;
        }
        try {
            await postRequest('/admin/users', {
                username: newUsername.trim(),
                password: newPassword,
                role: newRole
            });
            toast.success(`Benutzer "${newUsername}" erstellt.`);
            setShowNewUserDialog(false);
            setNewUsername('');
            setNewPassword('');
            setNewRole('teacher');
            setNewUserError('');
            loadUsers();
        } catch (error) {
            setNewUserError(error.message || 'Fehler beim Erstellen.');
        }
    };

    const deleteUserHandler = async (userId, username) => {
        if (!confirm(`Benutzer "${username}" wirklich löschen?`)) return;
        try {
            await deleteRequest(`/admin/users/${userId}`);
            toast.success(`Benutzer "${username}" gelöscht.`);
            loadUsers();
        } catch (error) {
            toast.error(error.message || 'Fehler beim Löschen.');
        }
    };

    const toggleRole = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'teacher' : 'admin';
        try {
            await putRequest(`/admin/users/${userId}/role`, {role: newRole});
            toast.success('Rolle aktualisiert.');
            loadUsers();
        } catch (error) {
            toast.error(error.message || 'Fehler beim Aktualisieren.');
        }
    };

    const resetPassword = async () => {
        if (!newPasswordValue || newPasswordValue.length < 6) {
            toast.error('Passwort muss mindestens 6 Zeichen lang sein.');
            return;
        }
        try {
            await putRequest(`/admin/users/${passwordResetUserId}/password`, {password: newPasswordValue});
            toast.success('Passwort zurückgesetzt.');
            setShowPasswordDialog(false);
            setPasswordResetUserId(null);
            setNewPasswordValue('');
        } catch (error) {
            toast.error(error.message || 'Fehler beim Zurücksetzen.');
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    if (loading) return null;

    return (
        <div className="admin-page">
            <motion.div className="admin-header" initial={{opacity: 0, y: -20}} animate={{opacity: 1, y: 0}}>
                <Link to="/"><img src={titleImg} alt="logo" className="admin-logo"/></Link>
                <div className="admin-header-right">
                    <span className="admin-user-info">
                        <FontAwesomeIcon icon={faShieldAlt}/>
                        {user?.username}
                    </span>
                    <Button text="Abmelden" icon={faRightFromBracket} type="secondary compact" onClick={handleLogout}/>
                </div>
            </motion.div>

            <motion.div className="admin-content" initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} transition={{delay: 0.1}}>
                <div className="admin-sidebar">
                    <button className={`sidebar-item ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                        <FontAwesomeIcon icon={faRobot}/> KI-Konfiguration
                    </button>
                    <button className={`sidebar-item ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>
                        <FontAwesomeIcon icon={faImage}/> Medien
                    </button>
                    <button className={`sidebar-item ${activeTab === 'branding' ? 'active' : ''}`} onClick={() => setActiveTab('branding')}>
                        <FontAwesomeIcon icon={faPalette}/> Branding
                    </button>
                    <button className={`sidebar-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                        <FontAwesomeIcon icon={faUsers}/> Benutzerverwaltung
                    </button>
                    <button className={`sidebar-item ${activeTab === 'apiKeys' ? 'active' : ''}`} onClick={() => setActiveTab('apiKeys')}>
                        <FontAwesomeIcon icon={faKey}/> API-Schlüssel
                    </button>
                </div>

                <div className="admin-panel">
                    {activeTab === 'ai' && (
                        <motion.div className="settings-section" initial={{opacity: 0}} animate={{opacity: 1}}>
                            <h2><FontAwesomeIcon icon={faRobot}/> KI-Konfiguration</h2>
                            <p className="section-description">Konfiguriere den KI-Anbieter für die automatische Quiz-Generierung.</p>

                            <div className="settings-form">
                                <div className="form-group">
                                    <label>Anbieter</label>
                                    <SelectBox value={aiProvider} onChange={setAiProvider} options={AI_PROVIDERS} placeholder="Anbieter wählen..."/>
                                </div>

                                {aiProvider && (
                                    <>
                                        {aiProvider !== 'ollama' && (
                                            <div className="form-group">
                                                <label>API-Schlüssel</label>
                                                <Input placeholder="sk-..." value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)}/>
                                            </div>
                                        )}
                                        <div className="form-group">
                                            <label>Modell</label>
                                            <SelectBox
                                                value={aiModel}
                                                onChange={setAiModel}
                                                options={aiModels}
                                                placeholder={modelsLoading ? 'Modelle werden geladen...' : 'Modell wählen...'}
                                                disabled={modelsLoading}
                                            />
                                        </div>
                                        {aiProvider === 'ollama' && (
                                            <div className="form-group">
                                                <label>Basis-URL</label>
                                                <Input placeholder="http://localhost:11434" value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)}/>
                                            </div>
                                        )}
                                    </>
                                )}

                                <Button text="Speichern" type="green compact" onClick={saveAiSettings}/>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'media' && (
                        <motion.div className="settings-section" initial={{opacity: 0}} animate={{opacity: 1}}>
                            <h2><FontAwesomeIcon icon={faImage}/> Medien</h2>
                            <p className="section-description">Konfiguriere API-Schlüssel für die Bildersuche im Quiz-Editor. Beide Dienste sind kostenlos.</p>

                            <div className="settings-form">
                                <div className="form-group">
                                    <label>Unsplash Access Key</label>
                                    <span className="form-hint">Erstelle eine App auf <a href="https://unsplash.com/oauth/applications/new" target="_blank" rel="noopener noreferrer">unsplash.com/developers</a> und kopiere den "Access Key".</span>
                                    <Input placeholder="z.B. ab12cd34ef56gh78ij90..." value={unsplashAccessKey} onChange={(e) => setUnsplashAccessKey(e.target.value)}/>
                                </div>
                                <div className="form-group">
                                    <label>Giphy API Key</label>
                                    <span className="form-hint">Erstelle eine App auf <a href="https://developers.giphy.com/dashboard/?create=true" target="_blank" rel="noopener noreferrer">developers.giphy.com</a> und kopiere den "API Key".</span>
                                    <Input placeholder="z.B. aBcDeFgHiJkLmNoPqRsT..." value={giphyApiKey} onChange={(e) => setGiphyApiKey(e.target.value)}/>
                                </div>

                                <Button text="Speichern" type="green compact" onClick={saveMediaSettings}/>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'branding' && (
                        <motion.div className="settings-section" initial={{opacity: 0}} animate={{opacity: 1}}>
                            <h2><FontAwesomeIcon icon={faPalette}/> Branding</h2>
                            <p className="section-description">Passe das Erscheinungsbild deiner Quizzle-Instanz an.</p>

                            <div className="settings-form">
                                <div className="form-group">
                                    <label>Logo</label>
                                    <div className="image-upload-area">
                                        <img src={logoPreview || logoImg} alt="Logo" className="image-preview logo-preview"/>
                                        <div className="image-upload-actions">
                                            <label className="upload-btn">
                                                <FontAwesomeIcon icon={faUpload}/> Bild wählen
                                                <input type="file" accept="image/*" hidden onChange={(e) => handleImageSelect('logo', e)}/>
                                            </label>
                                            {logoPreview && <Button text="Hochladen" type="green compact" onClick={() => uploadImage('logo')}/>}
                                            {!logoPreview && <button className="reset-btn" onClick={() => resetImage('logo')}><FontAwesomeIcon icon={faRotateLeft}/> Zurücksetzen</button>}
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Banner</label>
                                    <div className="image-upload-area">
                                        <img src={titlePreview || titleImg} alt="Banner" className="image-preview title-preview"/>
                                        <div className="image-upload-actions">
                                            <label className="upload-btn">
                                                <FontAwesomeIcon icon={faUpload}/> Bild wählen
                                                <input type="file" accept="image/*" hidden onChange={(e) => handleImageSelect('title', e)}/>
                                            </label>
                                            {titlePreview && <Button text="Hochladen" type="green compact" onClick={() => uploadImage('title')}/>}
                                            {!titlePreview && <button className="reset-btn" onClick={() => resetImage('title')}><FontAwesomeIcon icon={faRotateLeft}/> Zurücksetzen</button>}
                                        </div>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Name</label>
                                    <Input placeholder="Quizzle" value={brandName} onChange={(e) => setBrandName(e.target.value)}/>
                                </div>
                                <div className="form-group">
                                    <label>Primärfarbe</label>
                                    <div className="color-input-row">
                                        <input type="color" value={brandColor || '#6547EE'} onChange={(e) => setBrandColor(e.target.value)} className="color-picker"/>
                                        <Input placeholder="#6547EE" value={brandColor} onChange={(e) => setBrandColor(e.target.value)}/>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Impressum-URL</label>
                                    <Input placeholder="https://..." value={brandImprint} onChange={(e) => setBrandImprint(e.target.value)}/>
                                </div>
                                <div className="form-group">
                                    <label>Datenschutz-URL</label>
                                    <Input placeholder="https://..." value={brandPrivacy} onChange={(e) => setBrandPrivacy(e.target.value)}/>
                                </div>

                                <Button text="Speichern" type="green compact" onClick={saveBrandingSettings}/>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'users' && (
                        <motion.div className="settings-section" initial={{opacity: 0}} animate={{opacity: 1}}>
                            <div className="section-header-row">
                                <div>
                                    <h2><FontAwesomeIcon icon={faUsers}/> Benutzerverwaltung</h2>
                                    <p className="section-description">Verwalte Benutzerkonten und Berechtigungen.</p>
                                </div>
                                <Button text="Neuer Benutzer" icon={faPlus} type="primary compact" onClick={() => setShowNewUserDialog(true)}/>
                            </div>

                            <div className="user-list">
                                {users.map(u => (
                                    <div key={u.id} className="user-card">
                                        <div className="user-info">
                                            <FontAwesomeIcon icon={u.role === 'admin' ? faShieldAlt : faChalkboardTeacher} className={`role-icon ${u.role}`}/>
                                            <div>
                                                <span className="user-name">{u.username}</span>
                                                <span className="user-role">{u.role === 'admin' ? 'Administrator' : 'Lehrkraft'}</span>
                                            </div>
                                        </div>
                                        <div className="user-actions">
                                            {u.id !== user?.id && (
                                                <>
                                                    <button className="icon-btn" title="Rolle wechseln" onClick={() => toggleRole(u.id, u.role)}>
                                                        <FontAwesomeIcon icon={u.role === 'admin' ? faChalkboardTeacher : faShieldAlt}/>
                                                    </button>
                                                    <button className="icon-btn" title="Passwort zurücksetzen" onClick={() => {setPasswordResetUserId(u.id); setShowPasswordDialog(true);}}>
                                                        <FontAwesomeIcon icon={faKey}/>
                                                    </button>
                                                    <button className="icon-btn danger" title="Löschen" onClick={() => deleteUserHandler(u.id, u.username)}>
                                                        <FontAwesomeIcon icon={faTrash}/>
                                                    </button>
                                                </>
                                            )}
                                            {u.id === user?.id && <span className="you-badge">Du</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'apiKeys' && (
                        <motion.div className="settings-section" initial={{opacity: 0}} animate={{opacity: 1}}>
                            <div className="section-header-row">
                                <div>
                                    <h2><FontAwesomeIcon icon={faKey}/> API-Schlüssel</h2>
                                    <p className="section-description">Erstelle API-Schlüssel für dein eigenes Konto, um Quizzle per <code>Authorization: Bearer</code> zu automatisieren. Jeder Schlüssel trägt deine Rolle.</p>
                                </div>
                                <Button text="Neuer Schlüssel" icon={faPlus} type="primary compact" onClick={() => setShowNewApiKeyDialog(true)}/>
                            </div>

                            <div className="api-key-list">
                                {apiKeys.length === 0 && <p className="api-key-empty">Keine API-Schlüssel für diesen Benutzer.</p>}
                                {apiKeys.map(k => (
                                    <div key={k.id} className="api-key-card">
                                        <div className="api-key-info">
                                            <span className="api-key-name">{k.name}</span>
                                            <span className="api-key-meta">
                                                ••••{k.suffix} · erstellt am {new Date(k.createdAt).toLocaleDateString('de-DE')}
                                                {k.expiresAt ? ` · läuft ab ${new Date(k.expiresAt).toLocaleDateString('de-DE')}` : ' · kein Ablaufdatum'}
                                            </span>
                                        </div>
                                        <div className="user-actions">
                                            <button className="icon-btn danger" title="Schlüssel widerrufen" onClick={() => revokeApiKey(k.id)}>
                                                <FontAwesomeIcon icon={faTrash}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>
            </motion.div>

            <Dialog
                isOpen={showNewUserDialog}
                onClose={() => {setShowNewUserDialog(false); setNewUserError('');}}
                onConfirm={createUser}
                title="Neuen Benutzer erstellen"
                confirmText="Erstellen"
                cancelText="Abbrechen"
            >
                <div className="new-user-form">
                    <Input placeholder="Benutzername" value={newUsername} onChange={(e) => {setNewUsername(e.target.value); setNewUserError('');}}/>
                    <Input type="password" placeholder="Passwort" value={newPassword} onChange={(e) => {setNewPassword(e.target.value); setNewUserError('');}}/>
                    <SelectBox
                        value={newRole}
                        onChange={setNewRole}
                        options={[
                            {value: 'teacher', label: 'Lehrkraft', icon: faChalkboardTeacher},
                            {value: 'admin', label: 'Administrator', icon: faShieldAlt}
                        ]}
                    />
                    {newUserError && <div className="form-error">{newUserError}</div>}
                </div>
            </Dialog>

            <Dialog
                isOpen={showPasswordDialog}
                onClose={() => {setShowPasswordDialog(false); setNewPasswordValue('');}}
                onConfirm={resetPassword}
                title="Passwort zurücksetzen"
                confirmText="Zurücksetzen"
                cancelText="Abbrechen"
            >
                <div className="new-user-form">
                    <Input type="password" placeholder="Neues Passwort (min. 6 Zeichen)" value={newPasswordValue} onChange={(e) => setNewPasswordValue(e.target.value)}/>
                </div>
            </Dialog>

            <Dialog
                isOpen={showNewApiKeyDialog}
                onClose={() => {setShowNewApiKeyDialog(false); setNewApiKeyError('');}}
                onConfirm={createApiKey}
                title="Neuen API-Schlüssel erstellen"
                confirmText="Erstellen"
                cancelText="Abbrechen"
            >
                <div className="new-user-form">
                    <div className="form-group">
                        <label>Name</label>
                        <Input placeholder="z. B. CI-Bot" value={newKeyName} onChange={(e) => {setNewKeyName(e.target.value); setNewApiKeyError('');}}/>
                    </div>
                    <div className="form-group">
                        <label>Ablaufdatum (optional)</label>
                        <Input type="date" value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value)}/>
                    </div>
                    {newApiKeyError && <div className="form-error">{newApiKeyError}</div>}
                </div>
            </Dialog>

            <Dialog
                isOpen={!!newKeyResult}
                onClose={() => setNewKeyResult(null)}
                onConfirm={() => setNewKeyResult(null)}
                title="API-Schlüssel erstellt"
                confirmText="Fertig"
                showCancelButton={false}
            >
                <div className="new-key-result">
                    <p className="new-key-warning">
                        Dieser Schlüssel wird nur <strong>ein einziges Mal</strong> angezeigt.
                        Kopiere ihn jetzt — danach ist er nicht wiederherstellbar.
                    </p>
                    <div className="new-key-box">
                        <code>{newKeyResult?.key}</code>
                        <Button icon={faCopy} text="Kopieren" type="secondary compact" onClick={() => copyKey(newKeyResult?.key)}/>
                    </div>
                </div>
            </Dialog>
        </div>
    );
};
