using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

// Fiche d'identite de l'exe (Proprietes > Details) : un executable anonyme
// est juge plus suspect par les antivirus.
[assembly: AssemblyTitle("Installateur Vidéo_Continuum")]
[assembly: AssemblyDescription("Ouvre la page Tampermonkey puis la page d'installation du script Vidéo_Continuum. N'installe rien lui-même, ne demande pas de droits administrateur.")]
[assembly: AssemblyProduct("Vidéo_Continuum")]
[assembly: AssemblyCompany("Tryne")]
[assembly: AssemblyCopyright("Copyright (c) 2026 Tryne")]
[assembly: AssemblyVersion("6.11.0.0")]
[assembly: AssemblyFileVersion("6.11.0.0")]

// 2026-10-01 : assistant en fenetre (au lieu de la console) avec un ecran
// illustre par manipulation a faire par l'utilisateur. Illustrations :
// guide/*.png, generees depuis guide/mockups.html et embarquees dans l'exe
// (/resource a la compilation, voir HISTORIQUE.md).
namespace EspritDonghuaInstaller
{
    class Program
    {
        // Installe depuis l'URL brute GitHub (depot public) : l'ami n'a besoin
        // que de cet .exe, et Tampermonkey garde cette URL comme source de
        // mise a jour (@updateURL + bouton "Verifier MAJ" du script).
        const string ScriptUrl = "https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js";

        // ID Tampermonkey sur chaque store (fiches differentes).
        const string TmIdChromeStore = "dhdgffkkebhmkfjojejmpbldmpobfkfo";
        const string TmIdEdgeStore = "iikmkjmpaadaobahmlepeloendndfphd";

        const string TampermonkeyUrlChrome = "https://chromewebstore.google.com/detail/tampermonkey/" + TmIdChromeStore;
        const string TampermonkeyUrlFirefox = "https://addons.mozilla.org/firefox/addon/tampermonkey/";
        const string TampermonkeyUrlEdge = "https://microsoftedge.microsoft.com/addons/detail/tampermonkey/" + TmIdEdgeStore;
        // Opera a sa propre fiche sur son propre store (Tampermonkey y a un ID
        // different, meme constat que pour l'assistant Diablo IV).
        const string TampermonkeyUrlOpera = "https://addons.opera.com/en/extensions/details/tampermonkey-beta/";

        static readonly Color Bg = Color.FromArgb(0x15, 0x15, 0x1f);
        static readonly Color Accent = Color.FromArgb(0x03, 0xd0, 0xfc);

        class Browser { public string Key, Name, Exe, StoreUrl; }

        [STAThread]
        static int Main(string[] args)
        {
            // Diagnostic sans effet de bord.
            if (args.Length == 1 && args[0] == "--detect")
            {
                Console.WriteLine("chrome: " + (FindInstalledTampermonkeyId("chrome") ?? "absent"));
                Console.WriteLine("edge: " + (FindInstalledTampermonkeyId("edge") ?? "absent"));
                return 0;
            }

            Application.EnableVisualStyles();
            // Rendu de tous les ecrans en PNG, sans rien ouvrir (verification).
            if (args.Length == 2 && args[0] == "--preview") { Preview(args[1]); return 0; }

            Browser b = ChooseBrowser();
            if (b == null) return 1;

            // ---- Etape 1 : Tampermonkey ----
            // 2026-10-01 : l'installation automatique (cle HKLM "extensions
            // externes" + relance en administrateur) a ete RETIREE - Bitdefender
            // bloquait l'exe des sa compilation (schema typique d'adware qui
            // s'installe dans le navigateur). Store + ecran illustre a la place.
            bool chromium = b.Key == "chrome" || b.Key == "edge";
            string tmId = chromium ? FindInstalledTampermonkeyId(b.Key) : null;
            if (tmId != null)
            {
                if (!Page("Étape 1/3 - Tampermonkey", "Tampermonkey est déjà installé sur " + b.Name + ". Rien à faire ici.", null, null, null, "Suivant")) return 1;
            }
            else
            {
                Action openStore = () => TryOpen(b.Exe, b.StoreUrl);
                openStore();
                if (!Page("Étape 1/3 - Installer Tampermonkey",
                    "Tampermonkey est l'extension qui fait tourner le script.\n" +
                    "Sur la page qui vient de s'ouvrir, clique sur le bouton d'ajout, puis confirme.",
                    "store.png", "Rouvrir la page", openStore, "C'est fait")) return 1;
                if (chromium) tmId = FindInstalledTampermonkeyId(b.Key);
            }

            // ---- Etape 2 : autoriser les scripts (navigateurs Chromium) ----
            if (b.Key != "firefox")
            {
                string scheme = b.Key == "edge" ? "edge" : b.Key == "opera" ? "opera" : "chrome";
                Action openExt = () => TryOpen(b.Exe, scheme + "://extensions/" + (tmId != null ? "?id=" + tmId : ""));
                if (b.Exe != null) openExt();
                if (!Page("Étape 2/3 - Autoriser les scripts",
                    "Dans la page des extensions (Tampermonkey), active \"Autoriser les scripts utilisateur\".\n" +
                    "Sans ça, Tampermonkey n'exécute aucun script.",
                    "userscripts.png", b.Exe != null ? "Rouvrir la page" : null, openExt, "C'est fait")) return 1;
            }

            // ---- Etape 3 : installer le script ----
            Action openScript = () => TryOpen(b.Exe, ScriptUrl);
            openScript();
            Page("Étape 3/3 - Installer Vidéo_Continuum",
                "Tampermonkey affiche le script : clique sur \"Installer\". C'est tout !\n\n" +
                "Mises à jour automatiques. Un souci ? \"Signaler un problème\" dans le panneau.",
                "install.png", "Rouvrir la page", openScript, "Terminer");
            return 0;
        }

        // ---------- Fenetres ----------

        static Form NewForm(string title)
        {
            Form f = new Form();
            f.Text = "Installateur Vidéo_Continuum";
            f.ClientSize = new Size(580, 520);
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false; f.MinimizeBox = false;
            f.StartPosition = FormStartPosition.CenterScreen;
            f.BackColor = Bg; f.ForeColor = Color.FromArgb(0xee, 0xee, 0xee);
            f.Font = new Font("Segoe UI", 10f);
            Label t = new Label();
            t.Text = title; t.ForeColor = Accent; t.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
            t.Location = new Point(24, 18); t.AutoSize = true;
            f.Controls.Add(t);
            return f;
        }

        static Button NewButton(string text, bool primary)
        {
            Button b = new Button();
            b.Text = text; b.AutoSize = true; b.Height = 34; b.Padding = new Padding(10, 0, 10, 0);
            b.FlatStyle = FlatStyle.Flat; b.FlatAppearance.BorderSize = 0;
            b.BackColor = primary ? Accent : Color.FromArgb(0x33, 0x33, 0x33);
            b.ForeColor = primary ? Color.Black : Color.White;
            if (primary) b.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            return b;
        }

        // Une page : texte + illustration optionnelle + bouton secondaire
        // optionnel (ex. rouvrir la page) + bouton principal. false = fenetre
        // fermee/annulee.
        static Form BuildPage(string title, string text, string image, string extraLabel, Action extraAction, string nextLabel)
        {
            Form f = NewForm(title);
            Label body = new Label();
            body.Text = text; body.Location = new Point(24, 60); body.Size = new Size(532, image != null ? 90 : 300);
            f.Controls.Add(body);
            if (image != null)
            {
                PictureBox pic = new PictureBox();
                pic.Image = LoadImage(image); pic.SizeMode = PictureBoxSizeMode.Zoom;
                pic.Location = new Point(30, 155); pic.Size = new Size(520, 280);
                f.Controls.Add(pic);
            }
            FlowLayoutPanel bar = new FlowLayoutPanel();
            bar.FlowDirection = FlowDirection.RightToLeft;
            bar.Location = new Point(16, 466); bar.Size = new Size(548, 44);
            Button next = NewButton(nextLabel, true);
            next.DialogResult = DialogResult.OK;
            bar.Controls.Add(next);
            if (extraLabel != null)
            {
                Button extra = NewButton(extraLabel, false);
                extra.Click += (s, e) => extraAction();
                bar.Controls.Add(extra);
            }
            f.Controls.Add(bar);
            f.AcceptButton = next;
            return f;
        }

        static bool Page(string title, string text, string image, string extraLabel, Action extraAction, string nextLabel)
        {
            using (Form f = BuildPage(title, text, image, extraLabel, extraAction, nextLabel))
                return f.ShowDialog() == DialogResult.OK;
        }

        static Form BuildBrowserForm(out RadioButton[] radios, out Browser[] browsers)
        {
            browsers = new[] {
                new Browser { Key = "chrome", Name = "Chrome", Exe = "chrome.exe", StoreUrl = TampermonkeyUrlChrome },
                new Browser { Key = "edge", Name = "Edge", Exe = "msedge.exe", StoreUrl = TampermonkeyUrlEdge },
                new Browser { Key = "firefox", Name = "Firefox", Exe = "firefox.exe", StoreUrl = TampermonkeyUrlFirefox },
                new Browser { Key = "opera", Name = "Opera", Exe = "opera.exe", StoreUrl = TampermonkeyUrlOpera },
                // Navigateur par defaut : on suppose une base Chromium (Brave/Vivaldi).
                new Browser { Key = "default", Name = "ton navigateur", Exe = null, StoreUrl = TampermonkeyUrlChrome },
            };
            string[] labels = { "Chrome", "Edge", "Firefox", "Opera", "Autre (navigateur par défaut)" };
            Form f = NewForm("Bienvenue !");
            Label intro = new Label();
            intro.Text = "Cet assistant installe Vidéo_Continuum en 3 étapes, avec une image pour chaque clic à faire.\n\nQuel navigateur utilises-tu ?";
            intro.Location = new Point(24, 60); intro.Size = new Size(532, 80);
            f.Controls.Add(intro);
            radios = new RadioButton[labels.Length];
            for (int i = 0; i < labels.Length; i++)
            {
                radios[i] = new RadioButton();
                radios[i].Text = labels[i]; radios[i].AutoSize = true;
                radios[i].Location = new Point(40, 150 + i * 36);
                f.Controls.Add(radios[i]);
            }
            radios[0].Checked = true;
            Button next = NewButton("Commencer", true);
            next.DialogResult = DialogResult.OK;
            next.Location = new Point(440, 470);
            f.Controls.Add(next);
            f.AcceptButton = next;
            return f;
        }

        static Browser ChooseBrowser()
        {
            RadioButton[] radios; Browser[] browsers;
            using (Form f = BuildBrowserForm(out radios, out browsers))
            {
                if (f.ShowDialog() != DialogResult.OK) return null;
                for (int i = 0; i < radios.Length; i++) if (radios[i].Checked) return browsers[i];
            }
            return null;
        }

        static Image LoadImage(string name)
        {
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                return s == null ? null : new Bitmap(Image.FromStream(s));
        }

        static void Preview(string dir)
        {
            RadioButton[] r; Browser[] br;
            Form[] forms = {
                BuildBrowserForm(out r, out br),
                BuildPage("Étape 1/3 - Installer Tampermonkey", "Tampermonkey est l'extension qui fait tourner le script.\nSur la page qui vient de s'ouvrir, clique sur le bouton d'ajout, puis confirme.", "store.png", "Rouvrir la page", () => { }, "C'est fait"),
                BuildPage("Étape 2/3 - Autoriser les scripts", "Dans la page des extensions (Tampermonkey), active \"Autoriser les scripts utilisateur\".\nSans ça, Tampermonkey n'exécute aucun script.", "userscripts.png", "Rouvrir la page", () => { }, "C'est fait"),
                BuildPage("Étape 3/3 - Installer Vidéo_Continuum", "Tampermonkey affiche le script : clique sur \"Installer\". C'est tout !\n\nMises à jour automatiques. Un souci ? \"Signaler un problème\" dans le panneau.", "install.png", "Rouvrir la page", () => { }, "Terminer"),
            };
            for (int i = 0; i < forms.Length; i++)
            {
                Form f = forms[i];
                f.StartPosition = FormStartPosition.Manual; f.Location = new Point(-3000, -3000);
                f.Show(); Application.DoEvents();
                using (Bitmap bmp = new Bitmap(f.Width, f.Height))
                {
                    f.DrawToBitmap(bmp, new Rectangle(0, 0, f.Width, f.Height));
                    bmp.Save(Path.Combine(dir, "screen" + i + ".png"));
                }
                f.Close();
            }
        }

        // ---------- Tampermonkey ----------

        // Cherche le dossier de l'extension dans chaque profil du navigateur.
        // Edge accepte aussi la version du Chrome Web Store, d'ou les 2 ID.
        static string FindInstalledTampermonkeyId(string browserKey)
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string userData = browserKey == "edge"
                ? Path.Combine(local, @"Microsoft\Edge\User Data")
                : Path.Combine(local, @"Google\Chrome\User Data");
            if (!Directory.Exists(userData)) return null;
            string[] ids = browserKey == "edge" ? new[] { TmIdEdgeStore, TmIdChromeStore } : new[] { TmIdChromeStore };
            foreach (string profile in Directory.GetDirectories(userData))
                foreach (string id in ids)
                    if (Directory.Exists(Path.Combine(profile, "Extensions", id))) return id;
            return null;
        }

        // browserExe == null => navigateur par defaut du systeme. Sinon le
        // registre "App Paths" de chaque navigateur suffit a ShellExecute.
        static bool TryOpen(string browserExe, string target)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.UseShellExecute = true;
                if (browserExe == null) psi.FileName = target;
                else { psi.FileName = browserExe; psi.Arguments = "\"" + target + "\""; }
                Process.Start(psi);
                return true;
            }
            catch (Win32Exception)
            {
                return false;
            }
        }
    }
}
