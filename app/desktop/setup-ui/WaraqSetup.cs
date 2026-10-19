// Waraq setup window: a branded front-end for the NSIS installer, which is embedded as a resource and run silently.
// Built with the C# 5 compiler and WPF that ship with Windows (.NET Framework 4.x): tools/make-setup.cjs.
// "WaraqSetup.exe /S ..." (used by the app's own updater) skips the window and passes the arguments through.
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

[assembly: AssemblyTitle("Waraq PDF Studio Setup")]
[assembly: AssemblyProduct("Waraq PDF Studio")]
[assembly: AssemblyCompany("Abdullah Designs")]

namespace Waraq
{
    public static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            if (args.Any(a => a.Equals("/S", StringComparison.OrdinalIgnoreCase)))
                return Installer.RunSilent(string.Join(" ", args.Select(Installer.Quote)));
            var app = new Application();
            return app.Run(new SetupWindow());
        }
    }

    static class Installer
    {
        public static string Quote(string a) { return a.Contains(" ") ? "\"" + a + "\"" : a; }
        public static string Info(string key, string fallback)
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("info.txt"))
            using (var r = new StreamReader(s))
            {
                string line;
                while ((line = r.ReadLine()) != null)
                    if (line.StartsWith(key + "=")) return line.Substring(key.Length + 1).Trim();
            }
            return fallback;
        }
        public static string InstallDir { get { return System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "waraq-pdf-studio"); } }
        public static string AppExe { get { return System.IO.Path.Combine(InstallDir, "Waraq PDF Studio.exe"); } }
        public static string Extract()
        {
            var dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "waraq-setup-" + Process.GetCurrentProcess().Id);
            Directory.CreateDirectory(dir);
            var file = System.IO.Path.Combine(dir, "waraq-installer.exe");
            using (var src = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.exe"))
            using (var dst = File.Create(file)) src.CopyTo(dst, 1 << 20);
            return file;
        }
        public static int RunSilent(string args)
        {
            var file = Extract();
            try
            {
                var p = Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false });
                p.WaitForExit();
                return p.ExitCode;
            }
            finally { try { Directory.Delete(System.IO.Path.GetDirectoryName(file), true); } catch { } }
        }
        public static long FolderSize(string dir)
        {
            try { return new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => { try { return f.Length; } catch { return 0L; } }); }
            catch { return 0; }
        }
    }

    public class SetupWindow : Window
    {
        static readonly Color Green = Rgb(0x15, 0x77, 0x5d), Deep = Rgb(0x0d, 0x4f, 0x3e), Paper = Rgb(0xfb, 0xfa, 0xf6),
            Ink = Rgb(0x1f, 0x2a, 0x28), Muted = Rgb(0x5b, 0x6b, 0x64), Line = Rgb(0xe3, 0xe6, 0xdf), Mint = Rgb(0xe6, 0xf2, 0xec);
        static Color Rgb(byte r, byte g, byte b) { return Color.FromRgb(r, g, b); }
        static SolidColorBrush B(Color c) { var b = new SolidColorBrush(c); b.Freeze(); return b; }

        bool arabic = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "ar";
        string version = Installer.Info("version", "");
        long expected = long.Parse(Installer.Info("installedBytes", "400000000"));
        Grid content; Border card; CheckBox desktopShortcut; string state = "welcome"; double progress;
        string T(string en, string ar) { return arabic ? ar : en; }

        public SetupWindow()
        {
            Title = "Waraq PDF Studio Setup"; Width = 780; Height = 500; WindowStyle = WindowStyle.None; AllowsTransparency = true;
            Background = Brushes.Transparent; ResizeMode = ResizeMode.NoResize; WindowStartupLocation = WindowStartupLocation.CenterScreen;
            FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI"); UseLayoutRounding = true; TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
            try { Icon = BitmapFrame.Create(Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png")); } catch { }
            Build();
            MouseLeftButtonDown += (s, e) => { if (e.ButtonState == MouseButtonState.Pressed) try { DragMove(); } catch { } };
        }

        void Build()
        {
            card = new Border { CornerRadius = new CornerRadius(16), Background = B(Paper), Margin = new Thickness(18), ClipToBounds = true,
                Effect = new DropShadowEffect { BlurRadius = 28, ShadowDepth = 6, Opacity = 0.28, Color = Colors.Black } };
            var grid = new Grid { FlowDirection = arabic ? FlowDirection.RightToLeft : FlowDirection.LeftToRight };
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(280) });
            grid.ColumnDefinitions.Add(new ColumnDefinition());
            grid.Children.Add(BrandPanel());
            var right = new Grid { Margin = new Thickness(40, 20, 32, 28) };
            right.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            right.RowDefinitions.Add(new RowDefinition());
            Grid.SetColumn(right, 1); grid.Children.Add(right);
            right.Children.Add(TopBar());
            content = new Grid(); Grid.SetRow(content, 1); right.Children.Add(content);
            // rounded clip for the whole card
            card.Child = grid;
            card.Loaded += (s, e) => { card.Clip = new RectangleGeometry(new Rect(0, 0, card.ActualWidth, card.ActualHeight), 16, 16); };
            Content = card;
            Show(state);
        }

        UIElement BrandPanel()
        {
            var g = new LinearGradientBrush(Deep, Green, new Point(0, 1), new Point(1, 0));
            var panel = new Grid { Background = g };
            // soft rings, like folded paper
            for (int i = 0; i < 3; i++)
                panel.Children.Add(new Ellipse { Width = 260 + i * 120, Height = 260 + i * 120, Stroke = B(Color.FromArgb(22, 255, 255, 255)), StrokeThickness = 1.5,
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(-200, -40, -200, -40) });
            var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
            var tile = new Border { Width = 104, Height = 104, CornerRadius = new CornerRadius(26), Background = B(Paper), HorizontalAlignment = HorizontalAlignment.Center,
                Effect = new DropShadowEffect { BlurRadius = 20, ShadowDepth = 4, Opacity = 0.25 } };
            try { tile.Child = new Image { Source = BitmapFrame.Create(Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png")), Margin = new Thickness(14) }; } catch { }
            stack.Children.Add(tile);
            stack.Children.Add(new TextBlock { Text = "ورق", FontSize = 40, FontWeight = FontWeights.Bold, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 18, 0, 0), FontFamily = new FontFamily("Segoe UI") });
            stack.Children.Add(new TextBlock { Text = "W A R A Q", FontSize = 13, FontWeight = FontWeights.SemiBold, Foreground = B(Color.FromRgb(0xd6, 0xef, 0xe5)), HorizontalAlignment = HorizontalAlignment.Center });
            stack.Children.Add(new TextBlock { Text = "PDF Studio" + (version.Length > 0 ? "  ·  " + version : ""), FontSize = 13, Foreground = B(Color.FromArgb(200, 255, 255, 255)), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 6, 0, 0), FlowDirection = FlowDirection.LeftToRight });
            panel.Children.Add(stack);
            return panel;
        }

        UIElement TopBar()
        {
            var bar = new DockPanel { LastChildFill = false, Margin = new Thickness(0, 0, -12, 0) };
            var close = Flat("✕", 34); close.ToolTip = T("Close", "إغلاق"); close.Click += (s, e) => { if (state != "installing") Close(); };
            DockPanel.SetDock(close, Dock.Right); bar.Children.Add(close);
            var lang = Flat(arabic ? "English" : "عربي", 0); lang.Padding = new Thickness(12, 0, 12, 0);
            lang.Click += (s, e) => { if (state == "installing") return; arabic = !arabic; Build(); };
            DockPanel.SetDock(lang, Dock.Right); bar.Children.Add(lang);
            return bar;
        }

        Button Flat(string text, double width)
        {
            var b = new Button { Content = text, Height = 34, FontSize = 13, Foreground = B(Muted), Cursor = Cursors.Hand, Focusable = true };
            if (width > 0) b.Width = width;
            b.Template = ButtonTemplate(Brushes.Transparent, B(Mint), null, 8);
            return b;
        }

        static ControlTemplate ButtonTemplate(Brush normal, Brush hover, Brush border, double radius)
        {
            var t = new ControlTemplate(typeof(Button));
            var bd = new FrameworkElementFactory(typeof(Border), "bd");
            bd.SetValue(Border.BackgroundProperty, normal); bd.SetValue(Border.CornerRadiusProperty, new CornerRadius(radius));
            if (border != null) { bd.SetValue(Border.BorderBrushProperty, border); bd.SetValue(Border.BorderThicknessProperty, new Thickness(1)); }
            bd.SetValue(Border.PaddingProperty, new TemplateBindingExtension(Control.PaddingProperty));
            var cp = new FrameworkElementFactory(typeof(ContentPresenter));
            cp.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center); cp.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            bd.AppendChild(cp); t.VisualTree = bd;
            var over = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true }; over.Setters.Add(new Setter(Border.BackgroundProperty, hover, "bd")); t.Triggers.Add(over);
            var off = new Trigger { Property = UIElement.IsEnabledProperty, Value = false }; off.Setters.Add(new Setter(UIElement.OpacityProperty, 0.5)); t.Triggers.Add(off);
            return t;
        }

        Button Primary(string text)
        {
            var b = new Button { Content = text, Height = 46, MinWidth = 168, Padding = new Thickness(24, 0, 24, 0), FontSize = 15, FontWeight = FontWeights.SemiBold, Foreground = Brushes.White, Cursor = Cursors.Hand };
            b.Template = ButtonTemplate(B(Green), B(Deep), null, 12);
            return b;
        }
        Button Secondary(string text)
        {
            var b = new Button { Content = text, Height = 46, MinWidth = 120, Padding = new Thickness(20, 0, 20, 0), FontSize = 15, Foreground = B(Ink), Cursor = Cursors.Hand };
            b.Template = ButtonTemplate(Brushes.White, B(Mint), B(Line), 12);
            return b;
        }
        TextBlock Text(string text, double size, Color color, FontWeight weight)
        {
            return new TextBlock { Text = text, FontSize = size, Foreground = B(color), FontWeight = weight, TextWrapping = TextWrapping.Wrap };
        }

        void Show(string next)
        {
            state = next; content.Children.Clear();
            var stack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            content.Children.Add(stack);
            if (next == "welcome") Welcome(stack);
            else if (next == "installing") Installing(stack);
            else if (next == "done") Done(stack);
            else Failed(stack, next.Substring(6));
            // gentle fade/slide for each screen
            stack.Opacity = 0; stack.RenderTransform = new TranslateTransform(0, 10);
            stack.BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(260)));
            stack.RenderTransform.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(260)) { EasingFunction = new CubicEase() });
        }

        void Welcome(StackPanel s)
        {
            s.Children.Add(Text(T("Install Waraq PDF Studio", "تثبيت ورق — استوديو PDF"), 28, Ink, FontWeights.SemiBold));
            s.Children.Add(new Border { Height = 10 });
            s.Children.Add(Text(T("Arabic and English PDF tools that stay on your computer.", "أدوات PDF بالعربية والإنجليزية تبقى على جهازك."), 15, Muted, FontWeights.Normal));
            s.Children.Add(new Border { Height = 22 });
            foreach (var line in new[] {
                T("View large drawings, edit pages, sign and convert", "اعرض الرسومات الكبيرة وحرّر الصفحات ووقّع وحوّل"),
                T("Installs for you only — no administrator rights", "يُثبَّت لك وحدك — دون صلاحيات مسؤول"),
                T("Office and OCR add-ons download only when needed", "إضافات أوفيس وOCR تُنزَّل عند الحاجة فقط") })
                s.Children.Add(Bullet(line));
            s.Children.Add(new Border { Height = 18 });
            desktopShortcut = new CheckBox { Content = T("Create a desktop shortcut", "إنشاء اختصار على سطح المكتب"), IsChecked = true, FontSize = 13, Foreground = B(Ink), Cursor = Cursors.Hand };
            s.Children.Add(desktopShortcut);
            s.Children.Add(new Border { Height = 26 });
            var row = new DockPanel { LastChildFill = false };
            var go = Primary(T("Install", "تثبيت")); go.Click += (o, e) => Start(); go.IsDefault = true;
            row.Children.Add(go);
            var size = Text(T(string.Format("About {0} MB", expected / 1048576), string.Format("حوالي {0} ميغابايت", expected / 1048576)), 12, Muted, FontWeights.Normal);
            size.VerticalAlignment = VerticalAlignment.Center; size.Margin = new Thickness(16, 0, 0, 0);
            row.Children.Add(size);
            s.Children.Add(row);
        }

        UIElement Bullet(string text)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 10) };
            var dot = new Border { Width = 22, Height = 22, CornerRadius = new CornerRadius(11), Background = B(Mint), Margin = new Thickness(0, 0, 12, 0),
                Child = new TextBlock { Text = "✓", FontSize = 12, FontWeight = FontWeights.Bold, Foreground = B(Green), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
            row.Children.Add(dot);
            var t = Text(text, 14, Ink, FontWeights.Normal); t.VerticalAlignment = VerticalAlignment.Center; row.Children.Add(t);
            return row;
        }

        TextBlock stepText, percentText; Border fill; Grid track;
        void Installing(StackPanel s)
        {
            s.Children.Add(Text(T("Installing Waraq…", "جارٍ تثبيت ورق…"), 28, Ink, FontWeights.SemiBold));
            s.Children.Add(new Border { Height = 8 });
            stepText = Text(T("Preparing…", "جارٍ التحضير…"), 15, Muted, FontWeights.Normal); s.Children.Add(stepText);
            s.Children.Add(new Border { Height = 28 });
            track = new Grid { Height = 10 };
            track.Children.Add(new Border { CornerRadius = new CornerRadius(5), Background = B(Line) });
            fill = new Border { CornerRadius = new CornerRadius(5), HorizontalAlignment = HorizontalAlignment.Left, Width = 0,
                Background = new LinearGradientBrush(Green, Color.FromRgb(0x2f, 0xa7, 0x83), 0) };
            track.Children.Add(fill); s.Children.Add(track);
            s.Children.Add(new Border { Height = 10 });
            percentText = Text("0%", 13, Muted, FontWeights.SemiBold); s.Children.Add(percentText);
            s.Children.Add(new Border { Height = 30 });
            s.Children.Add(Text(T("This takes about half a minute. You can keep working meanwhile.", "يستغرق ذلك نحو نصف دقيقة. يمكنك متابعة عملك في الأثناء."), 13, Muted, FontWeights.Normal));
        }

        void SetProgress(double p, string step)
        {
            progress = Math.Max(progress, Math.Min(1, p));
            if (fill == null || track == null) return;
            fill.BeginAnimation(WidthProperty, new DoubleAnimation(track.ActualWidth * progress, TimeSpan.FromMilliseconds(400)) { EasingFunction = new QuadraticEase() });
            percentText.Text = string.Format("{0}%", (int)Math.Round(progress * 100));
            if (step != null) stepText.Text = step;
        }

        void Start()
        {
            bool shortcut = desktopShortcut.IsChecked == true;
            Show("installing");
            var started = DateTime.Now; long low = long.MaxValue; bool fresh = false; int exit = -1; string error = null;
            var work = Task.Run(() =>
            {
                try
                {
                    var file = Installer.Extract();
                    var p = Process.Start(new ProcessStartInfo(file, "/S") { UseShellExecute = false });
                    p.WaitForExit(); exit = p.ExitCode;
                    try { Directory.Delete(System.IO.Path.GetDirectoryName(file), true); } catch { }
                    if (exit == 0 && !shortcut)
                        try { File.Delete(System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Waraq PDF Studio.lnk")); } catch { }
                }
                catch (Exception e) { error = e.Message; }
            });
            var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
            timer.Tick += (s, e) =>
            {
                double t = (DateTime.Now - started).TotalSeconds;
                long size = Installer.FolderSize(Installer.InstallDir);
                // an update first removes the old copy: count growth only once the folder has been emptied
                low = Math.Min(low, size); if (low < expected / 10) fresh = true;
                double bySize = fresh ? (double)(size - low) / Math.Max(1, expected - low) : 0;
                double byTime = 0.9 * (1 - Math.Exp(-t / 9));
                double p = Math.Min(0.97, Math.Max(bySize, byTime));
                string step = p < 0.15 ? T("Unpacking…", "جارٍ فك الملفات…") : p < 0.8 ? T("Copying Waraq to your computer…", "جارٍ نسخ ورق إلى جهازك…") : T("Adding “Open in Waraq” to the right-click menu…", "جارٍ إضافة «فتح في ورق» إلى قائمة الزر الأيمن…");
                SetProgress(p, step);
                if (work.IsCompleted)
                {
                    timer.Stop();
                    if (error == null && exit == 0) { SetProgress(1, T("Done", "تم")); var d = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) }; d.Tick += (a, b) => { d.Stop(); Show("done"); }; d.Start(); }
                    else Show("error:" + (error ?? ("code " + exit)));
                }
            };
            timer.Start();
        }

        void Done(StackPanel s)
        {
            var badge = new Border { Width = 64, Height = 64, CornerRadius = new CornerRadius(32), Background = B(Mint), HorizontalAlignment = HorizontalAlignment.Left,
                Child = new TextBlock { Text = "✓", FontSize = 30, FontWeight = FontWeights.Bold, Foreground = B(Green), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
            badge.RenderTransformOrigin = new Point(0.5, 0.5); var sc = new ScaleTransform(0.6, 0.6); badge.RenderTransform = sc;
            var pop = new DoubleAnimation(1, TimeSpan.FromMilliseconds(380)) { EasingFunction = new BackEase { Amplitude = 0.4 } };
            sc.BeginAnimation(ScaleTransform.ScaleXProperty, pop); sc.BeginAnimation(ScaleTransform.ScaleYProperty, pop);
            s.Children.Add(badge);
            s.Children.Add(new Border { Height = 20 });
            s.Children.Add(Text(T("Waraq is ready", "ورق جاهز"), 28, Ink, FontWeights.SemiBold));
            s.Children.Add(new Border { Height = 8 });
            s.Children.Add(Text(T("Find it in the Start menu, or right-click any PDF and choose “Open in Waraq”.", "ستجده في قائمة ابدأ، أو انقر بالزر الأيمن على أي ملف PDF واختر «فتح في ورق»."), 15, Muted, FontWeights.Normal));
            s.Children.Add(new Border { Height = 30 });
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            var open = Primary(T("Open Waraq", "افتح ورق")); open.IsDefault = true;
            open.Click += (o, e) => { try { Process.Start(new ProcessStartInfo(Installer.AppExe) { UseShellExecute = true }); } catch { } Close(); };
            var close = Secondary(T("Close", "إغلاق")); close.Margin = new Thickness(12, 0, 0, 0); close.Click += (o, e) => Close();
            row.Children.Add(open); row.Children.Add(close); s.Children.Add(row);
        }

        void Failed(StackPanel s, string detail)
        {
            s.Children.Add(Text(T("Waraq could not be installed", "تعذر تثبيت ورق"), 26, Ink, FontWeights.SemiBold));
            s.Children.Add(new Border { Height = 10 });
            s.Children.Add(Text(T("Close Waraq if it is open, then try again. Nothing on your computer was changed.", "أغلق ورق إن كان مفتوحاً ثم حاول مجدداً. لم يتغير شيء على جهازك."), 15, Muted, FontWeights.Normal));
            s.Children.Add(new Border { Height = 6 });
            s.Children.Add(Text(detail, 12, Muted, FontWeights.Normal));
            s.Children.Add(new Border { Height = 26 });
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            var retry = Primary(T("Try again", "حاول مجدداً")); retry.Click += (o, e) => { progress = 0; Start(); };
            var close = Secondary(T("Close", "إغلاق")); close.Margin = new Thickness(12, 0, 0, 0); close.Click += (o, e) => Close();
            row.Children.Add(retry); row.Children.Add(close); s.Children.Add(row);
        }
    }
}
