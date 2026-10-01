using System;
using System.ComponentModel;
using System.Diagnostics;

namespace EspritDonghuaInstaller
{
    class Program
    {
        // 2026-10-01 : installe depuis l'URL brute GitHub (depot public)
        // plutot qu'un fichier local - l'ami testeur n'a besoin que de cet
        // .exe, et Tampermonkey enregistre cette URL comme source de mise a
        // jour (@updateURL + bouton "Verifier MAJ" du script). Evite aussi
        // l'autorisation "acces aux URL de fichier" qu'un file:// demande.
        const string ScriptUrl = "https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js";

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
            Console.WriteLine("=== Installateur Video Continuum ===");
            Console.WriteLine();

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
            Console.WriteLine("Chrome/Edge/Opera : apres l'installation, active aussi \"Autoriser les scripts");
            Console.WriteLine("utilisateur\" (ou le \"Mode developpeur\") dans la page des extensions,");
            Console.WriteLine("sinon Tampermonkey n'execute aucun script.");
            Console.WriteLine();
            Console.WriteLine("Appuie sur Entree une fois Tampermonkey installe (ou s'il l'etait deja).");
            Console.ReadLine();

            Console.WriteLine("Etape 2/2 : ouverture du script - la fenetre d'installation Tampermonkey doit s'afficher.");
            if (!TryOpen(browserExe, ScriptUrl))
            {
                Console.WriteLine("Impossible d'ouvrir ce navigateur pour le script.");
                Console.WriteLine("Ouvre ce lien manuellement : " + ScriptUrl);
                Pause();
                return 1;
            }

            Console.WriteLine();
            Console.WriteLine("Termine. Clique sur \"Installer\" dans la fenetre Tampermonkey qui s'est ouverte.");
            Console.WriteLine("Les mises a jour arriveront ensuite automatiquement (ou bouton \"Verifier MAJ\").");
            Console.WriteLine("Un souci ? Panneau du script > \"Signaler un probleme\".");
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

        static void Pause()
        {
            Console.WriteLine();
            Console.WriteLine("Appuie sur Entree pour fermer...");
            Console.Read();
        }
    }
}
