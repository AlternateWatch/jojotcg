import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogIn, LogOut, ShieldCheck, UserCheck, UserPlus, X } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';

export function AuthModal() {
  const showAuthModal = useAppStore((s) => s.showAuthModal);
  const setShowAuthModal = useAppStore((s) => s.setShowAuthModal);
  const authUser = useAppStore((s) => s.authUser);
  const loginAccount = useAppStore((s) => s.loginAccount);
  const registerAccount = useAppStore((s) => s.registerAccount);
  const logoutAccount = useAppStore((s) => s.logoutAccount);

  const [tab, setTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    setShowAuthModal(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    if (cleanUser.length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (tab === 'REGISTER' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const res =
      tab === 'LOGIN'
        ? await loginAccount(cleanUser, password)
        : await registerAccount(cleanUser, password);
    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    resetForm();
  };

  return (
    <AnimatePresence>
      {showAuthModal && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Cuenta de Usuario"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/88 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="jojo-panel relative w-full max-w-md space-y-5 p-6"
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar"
              className="jojo-btn-ink absolute top-4 right-4 flex h-8 w-8 items-center justify-center"
            >
              <X size={16} />
            </button>

            <div>
              <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#e6194b] uppercase">
                REGISTRO DE LA FUNDACIÓN SPEEDWAGON
              </div>
              <h2 className="mt-1 font-jojo-display text-3xl text-[#f5efe0] uppercase">
                {authUser ? `CUENTA: ${authUser.username}` : 'CUENTA DE JUGADOR'}
              </h2>
            </div>

            {authUser ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 border-2 border-[#060508] bg-[#0e0b14] p-3.5 text-xs">
                  <UserCheck size={20} className="shrink-0 text-[#00e599]" />
                  <div>
                    <div className="font-bold text-[#00e599]">
                      Sesión activa como {authUser.username}
                    </div>
                    <p className="mt-1 text-zinc-300">
                      Tus cartas desbloqueadas, repetidas para crafteo, monedas y mazos se guardan
                      automáticamente en la base de datos MySQL del servidor.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-wider uppercase"
                  >
                    Seguir Jugando
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await logoutAccount();
                      handleClose();
                    }}
                    className="jojo-btn-crimson inline-flex items-center gap-1.5 px-4 py-2 font-jojo-heading text-xs tracking-wider uppercase"
                  >
                    <LogOut size={14} /> Cerrar Sesión
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2.5 border-2 border-[#060508] border-l-4 border-l-[#f2c12e] bg-[#1b1426] p-3 text-xs text-zinc-200">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#f2c12e]" />
                  <span>
                    En <strong>modo invitado</strong> tus cartas y progreso se borran al cerrar la
                    ventana. <strong>Regístrate o inicia sesión</strong> para guardar tu colección
                    permanentemente (al registrarte se guardará el progreso que lleves en esta
                    sesión).
                  </span>
                </div>

                {/* Mode Tabs */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('LOGIN');
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 font-jojo-heading text-sm tracking-widest uppercase ${
                      tab === 'LOGIN' ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
                    }`}
                  >
                    <LogIn size={14} /> Iniciar Sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('REGISTER');
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 font-jojo-heading text-sm tracking-widest uppercase ${
                      tab === 'REGISTER' ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
                    }`}
                  >
                    <UserPlus size={14} /> Crear Cuenta
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div>
                    <label className="mb-1 block font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase">
                      Nombre de Usuario
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ej. JotaroKujo"
                      className="w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-sm text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete={tab === 'LOGIN' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-sm text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                    />
                  </div>

                  {tab === 'REGISTER' && (
                    <div>
                      <label className="mb-1 block font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase">
                        Repetir Contraseña
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-sm text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="border-l-4 border-[#e6194b] bg-[#2a0c16] px-3 py-2 text-xs font-bold text-rose-200">
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-wider uppercase"
                    >
                      Seguir como Invitado
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="jojo-btn-primary inline-flex items-center gap-1.5 px-5 py-2 font-jojo-heading text-sm tracking-widest uppercase disabled:opacity-45"
                    >
                      {loading
                        ? 'Conectando...'
                        : tab === 'LOGIN'
                          ? 'Entrar'
                          : 'Registrar y Guardar'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
