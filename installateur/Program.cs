using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;

namespace EspritDonghuaInstaller
{
    class Program
    {
        // Nom du fichier .user.js a installer, cherche dans le dossier
        // parent de celui de cet executable (le repo du projet). A changer
        // pour anime-tracker-generique.user.js une fois cette version
        // validee en usage reel (voir HISTORIQUE.md).
        const string TargetScriptFileName = "esprit-donghua-suivi-progression-v6.user.js";

        const string TampermonkeyUrlChrome = "https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo";
        const string TampermonkeyUrlFirefox = "https://addons.mozilla.org/firefox/addon/tampermonkey/";
        const string TampermonkeyUrlEdge = "https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd";
        // Opera a sa propre fiche sur son propre store (pas le Chrome Web
        // Store) meme si Opera est base sur Chromium - installer depuis le
        // Chrome Web Store y est plus fragile/demande une extension tierce
        // (meme constat que dans le projet Diablo IV Assistant, verifie le
        // 2026-09-26 : Tampermonkey a un ID d'extension different sur Opera).
        const string TampermonkeyUrlOpera = "https://addons.opera.com/en/extensions/details/tampermonkey-beta/";

        static int Main(string[] args)
        {
            Console.WriteLine("=== Installateur Esprit Donghua Tracker ===");
            Console.WriteLine();

            string scriptPath = FindScriptPath();
            if (scriptPath == null)
            {
                Console.WriteLine("Erreur : fichier " + TargetScriptFileName + " introuvable a cote de cet installateur.");
                Console.WriteLine("Verifie que l'executable est bien reste dans le dossier du projet.");
                Pause();
                return 1;
            }

            string browserExe;
            string tampermonkeyUrl;
            if (!ChooseBrowser(out browserExe, out tampermonkeyUrl))
            {
                Console.WriteLine("Choix invalide, arret.");
                Pause();
                return 1;
            }

            Console.WriteLine();
            Console.WriteLine("Etape 1/2 : ouverture de la page Tampermonkey (installe-le si ce n'est pas deja fait).");
            if (!TryOpen(browserExe, tampermonkeyUrl))
            {
                Console.WriteLine("Impossible d'ouvrir ce navigateur (introuvable sur cette machine).");
                Console.WriteLine("Installe/ouvre-le manuellement, puis installe l'extension Tampermonkey : " + tampermonkeyUrl);
            }

            Console.WriteLine();
            Console.WriteLine("Appuie sur Entree une fois Tampermonkey installe (ou s'il l'etait deja).");
            Console.ReadLine();

            Console.WriteLine("Etape 2/2 : ouverture du script - la fenetre d'installation Tampermonkey doit s'afficher.");
            if (!TryOpen(browserExe, scriptPath))
            {
                Console.WriteLine("Impossible d'ouvrir ce navigateur pour le script.");
                Console.WriteLine("Ouvre-le manuellement : " + scriptPath);
                Pause();
                return 1;
            }

            Console.WriteLine();
            Console.WriteLine("Termine. Confirme l'installation dans la fenetre Tampermonkey qui s'est ouverte.");
            Pause();
            return 0;
        }

        static bool ChooseBrowser(out string browserExe, out string tampermonkeyUrl)
        {
            Console.WriteLine("Choisis le navigateur a utiliser :");
            Console.WriteLine("  1) Chrome");
            Console.WriteLine("  2) Firefox");
            Console.WriteLine("  3) Edge");
            Console.WriteLine("  4) Opera");
            Console.WriteLine("  5) Autre (navigateur par defaut du systeme)");
            Console.Write("> ");
            string choice = Console.ReadLine();

            switch ((choice ?? "").Trim())
            {
                case "1":
                    browserExe = "chrome.exe";
                    tampermonkeyUrl = TampermonkeyUrlChrome;
                    return true;
                case "2":
                    browserExe = "firefox.exe";
                    tampermonkeyUrl = TampermonkeyUrlFirefox;
                    return true;
                case "3":
                    browserExe = "msedge.exe";
                    tampermonkeyUrl = TampermonkeyUrlEdge;
                    return true;
                case "4":
                    browserExe = "opera.exe";
                    tampermonkeyUrl = TampermonkeyUrlOpera;
                    return true;
                case "5":
                    // Pas de navigateur precis : on laisse Windows ouvrir le
                    // navigateur par defaut, on suppose une base Chromium
                    // (page Chrome Web Store, compatible Brave/Vivaldi).
                    browserExe = null;
                    tampermonkeyUrl = TampermonkeyUrlChrome;
                    return true;
                default:
                    browserExe = null;
                    tampermonkeyUrl = null;
                    return false;
            }
        }

        // browserExe == null => ouverture avec le navigateur par defaut du systeme.
        // Sinon, on s'appuie sur le registre "App Paths" que chaque navigateur
        // installe (HKLM/HKCU ...\App Paths\chrome.exe etc.) : passer juste le
        // nom du .exe a ShellExecute suffit, pas besoin de deviner son chemin
        // d'installation.
        static bool TryOpen(string browserExe, string target)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.UseShellExecute = true;
                if (browserExe == null)
                {
                    psi.FileName = target;
                }
                else
                {
                    psi.FileName = browserExe;
                    psi.Arguments = "\"" + target + "\"";
                }
                Process.Start(psi);
                return true;
            }
            catch (Win32Exception)
            {
                return false;
            }
        }

        static string FindScriptPath()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string candidate = Path.Combine(baseDir, TargetScriptFileName);
            if (File.Exists(candidate)) return candidate;

            string parentCandidate = Path.Combine(baseDir, "..", TargetScriptFileName);
            if (File.Exists(parentCandidate)) return Path.GetFullPath(parentCandidate);

            return null;
        }

        static void Pause()
        {
            Console.WriteLine();
            Console.WriteLine("Appuie sur Entree pour fermer...");
            Console.Read();
        }
    }
}
