/**
 * Seed `i18n_overrides` with curated translations for the most common
 * Arabic UI strings extracted from the frozen frontend source. Running
 * this script idempotently inserts/updates rows for `en` and `fr`.
 *
 *   npm --prefix backend run seed:i18n
 *
 * Re-run after adding new entries to OVERRIDES; each entry is keyed by
 * the source phrase and is upserted, so previous translations stay
 * intact unless the script changes their value.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

interface Entry {
  ar: string;
  en: string;
  fr: string;
  domain?: string;
}

/* eslint-disable max-len */
const OVERRIDES: Entry[] = [
  // ---- core CTAs ----
  { ar: 'مواصلات', en: 'Mwasalat', fr: 'Mwasalat', domain: 'brand' },
  { ar: 'اعرف تركب إيه قبل ما تنزل', en: 'Know what to ride before you head out', fr: 'Sachez quoi prendre avant de sortir' },
  { ar: 'تسجيل الدخول', en: 'Sign in', fr: 'Se connecter' },
  { ar: 'إنشاء حساب', en: 'Create account', fr: 'Créer un compte' },
  { ar: 'تسجيل الخروج', en: 'Sign out', fr: 'Se déconnecter' },
  { ar: 'البريد الإلكتروني', en: 'Email', fr: 'E-mail' },
  { ar: 'كلمة المرور', en: 'Password', fr: 'Mot de passe' },
  { ar: 'رمز التحقق', en: 'Verification code', fr: 'Code de vérification' },
  { ar: 'حفظ', en: 'Save', fr: 'Enregistrer' },
  { ar: 'إلغاء', en: 'Cancel', fr: 'Annuler' },
  { ar: 'تأكيد', en: 'Confirm', fr: 'Confirmer' },
  { ar: 'حذف', en: 'Delete', fr: 'Supprimer' },
  { ar: 'تعديل', en: 'Edit', fr: 'Modifier' },
  { ar: 'إضافة', en: 'Add', fr: 'Ajouter' },
  { ar: 'بحث', en: 'Search', fr: 'Rechercher' },
  { ar: 'مشاركة', en: 'Share', fr: 'Partager' },
  { ar: 'مشاركة على واتساب', en: 'Share on WhatsApp', fr: 'Partager sur WhatsApp' },
  { ar: 'متابعة', en: 'Continue', fr: 'Continuer' },
  { ar: 'رجوع', en: 'Back', fr: 'Retour' },
  { ar: 'التالي', en: 'Next', fr: 'Suivant' },
  { ar: 'تم', en: 'Done', fr: 'Terminé' },
  { ar: 'جارٍ التحميل...', en: 'Loading…', fr: 'Chargement…' },
  { ar: 'لا توجد نتائج', en: 'No results', fr: 'Aucun résultat' },
  { ar: 'حدث خطأ', en: 'Something went wrong', fr: 'Une erreur est survenue' },
  { ar: 'حاول مرة أخرى', en: 'Try again', fr: 'Réessayer' },
  // ---- transit domain ----
  { ar: 'محطة', en: 'Station', fr: 'Station' },
  { ar: 'موقف', en: 'Stop', fr: 'Arrêt' },
  { ar: 'خط', en: 'Line', fr: 'Ligne' },
  { ar: 'مسار', en: 'Route', fr: 'Itinéraire' },
  { ar: 'الموقف الأقرب', en: 'Nearest stop', fr: 'Arrêt le plus proche' },
  { ar: 'العربيات المتاحة', en: 'Available cars', fr: 'Véhicules disponibles' },
  { ar: 'الزحمة', en: 'Traffic', fr: 'Trafic' },
  { ar: 'الأجرة', en: 'Fare', fr: 'Tarif' },
  { ar: 'الميكروباص', en: 'Microbus', fr: 'Microbus' },
  { ar: 'الأتوبيس', en: 'Bus', fr: 'Bus' },
  { ar: 'التاكسي', en: 'Taxi', fr: 'Taxi' },
  { ar: 'المسار الكامل', en: 'Full route', fr: 'Itinéraire complet' },
  { ar: 'المدة المتوقعة', en: 'Estimated time', fr: 'Durée estimée' },
  { ar: 'وقت الوصول', en: 'Arrival time', fr: 'Heure d’arrivée' },
  { ar: 'وقت الانطلاق', en: 'Departure time', fr: 'Heure de départ' },
  { ar: 'تتبع الرحلة', en: 'Track this trip', fr: 'Suivre ce trajet' },
  { ar: 'بدء الرحلة', en: 'Start trip', fr: 'Commencer le trajet' },
  { ar: 'إنهاء الرحلة', en: 'End trip', fr: 'Terminer le trajet' },
  { ar: 'شارك معاد وصولي', en: 'Share my ETA', fr: 'Partager mon arrivée' },
  { ar: 'بلّغ عن زحمة', en: 'Report traffic', fr: 'Signaler du trafic' },
  { ar: 'صحّح الأجرة', en: 'Correct the fare', fr: 'Corriger le tarif' },
  { ar: 'اقترح بديل', en: 'Suggest an alternative', fr: 'Suggérer une alternative' },
  { ar: 'أضف موقف', en: 'Add a stop', fr: 'Ajouter un arrêt' },
  { ar: 'أضف خط', en: 'Add a line', fr: 'Ajouter une ligne' },
  { ar: 'تجربتي', en: 'My experience', fr: 'Mon expérience' },
  // ---- planner ----
  { ar: 'من أين؟', en: 'From?', fr: 'D’où ?' },
  { ar: 'إلى أين؟', en: 'To?', fr: 'Vers où ?' },
  { ar: 'موقعي الحالي', en: 'My current location', fr: 'Ma position actuelle' },
  { ar: 'خطط رحلتك', en: 'Plan your trip', fr: 'Planifiez votre trajet' },
  { ar: 'أفضل خط', en: 'Best line', fr: 'Meilleure ligne' },
  { ar: 'الخطوط البديلة', en: 'Alternative lines', fr: 'Lignes alternatives' },
  // ---- admin ----
  { ar: 'لوحة التحكم', en: 'Dashboard', fr: 'Tableau de bord' },
  { ar: 'الإحصائيات', en: 'Analytics', fr: 'Analytique' },
  { ar: 'المستخدمون', en: 'Users', fr: 'Utilisateurs' },
  { ar: 'الفريق', en: 'Team', fr: 'Équipe' },
  { ar: 'الفوترة', en: 'Billing', fr: 'Facturation' },
  { ar: 'الاشتراك', en: 'Subscription', fr: 'Abonnement' },
  { ar: 'الخطة الحالية', en: 'Current plan', fr: 'Forfait actuel' },
  { ar: 'الترقية', en: 'Upgrade', fr: 'Mettre à niveau' },
  { ar: 'إدارة الفريق', en: 'Manage team', fr: 'Gérer l’équipe' },
  { ar: 'دعوة عضو', en: 'Invite member', fr: 'Inviter un membre' },
  { ar: 'الأذونات', en: 'Permissions', fr: 'Autorisations' },
  { ar: 'سجل التدقيق', en: 'Audit log', fr: 'Journal d’audit' },
  { ar: 'المسودات', en: 'Drafts', fr: 'Brouillons' },
  { ar: 'الاقتراحات', en: 'Suggestions', fr: 'Suggestions' },
  { ar: 'مراجعة', en: 'Review', fr: 'Revue' },
  { ar: 'نشر', en: 'Publish', fr: 'Publier' },
  { ar: 'موافقة', en: 'Approve', fr: 'Approuver' },
  { ar: 'رفض', en: 'Reject', fr: 'Rejeter' },
  // ---- social / growth ----
  { ar: 'صديقي ركب الميكروباص', en: 'My friend boarded', fr: 'Mon ami est monté' },
  { ar: 'تابع لايف', en: 'Follow live', fr: 'Suivre en direct' },
  { ar: 'انضم للرحلة', en: 'Join trip', fr: 'Rejoindre le trajet' },
  { ar: 'الرحلات اليومية', en: 'Daily commutes', fr: 'Trajets quotidiens' },
  { ar: 'مجتمع الموقف', en: 'Stop community', fr: 'Communauté de l’arrêt' },
  { ar: 'كاباتن الموقف', en: 'Stop captains', fr: 'Capitaines de l’arrêt' },
  { ar: 'لوحة الشرف', en: 'Leaderboard', fr: 'Classement' },
  { ar: 'مساهماتي', en: 'My contributions', fr: 'Mes contributions' },
  { ar: 'ادع صديق', en: 'Invite a friend', fr: 'Inviter un ami' },
  { ar: 'ربحت نقاط', en: 'You earned points', fr: 'Vous avez gagné des points' },
  // ---- common phrases & status ----
  { ar: 'مفتوح', en: 'Open', fr: 'Ouvert' },
  { ar: 'مغلق', en: 'Closed', fr: 'Fermé' },
  { ar: 'متاح', en: 'Available', fr: 'Disponible' },
  { ar: 'غير متاح', en: 'Unavailable', fr: 'Indisponible' },
  { ar: 'نشط', en: 'Active', fr: 'Actif' },
  { ar: 'غير نشط', en: 'Inactive', fr: 'Inactif' },
  { ar: 'دلوقتي', en: 'Right now', fr: 'En ce moment' },
  { ar: 'منذ دقائق', en: 'Minutes ago', fr: 'Il y a quelques minutes' },
  { ar: 'اليوم', en: 'Today', fr: 'Aujourd’hui' },
  { ar: 'أمس', en: 'Yesterday', fr: 'Hier' },
  { ar: 'بكرة', en: 'Tomorrow', fr: 'Demain' },
  // ---- whatsapp share captions (must match planner shareTrip msg) ----
  { ar: 'أنا في الميكروباص، تابعي وصولي لايف', en: 'I’m on the microbus — track me live', fr: 'Je suis dans le microbus — suivez-moi en direct' },
  { ar: 'وصلت بسلام', en: 'Arrived safely', fr: 'Bien arrivé(e)' },
  { ar: 'هوصل خلال', en: 'Arriving in', fr: 'Arrivée dans' },
  { ar: 'دقيقة', en: 'minute', fr: 'minute' },
  { ar: 'دقايق', en: 'minutes', fr: 'minutes' },
  { ar: 'جنيه', en: 'EGP', fr: 'EGP' },
  // ---- map ----
  { ar: 'الخريطة', en: 'Map', fr: 'Carte' },
  { ar: 'تكبير', en: 'Zoom in', fr: 'Zoom avant' },
  { ar: 'تصغير', en: 'Zoom out', fr: 'Zoom arrière' },
  { ar: 'مركز الخريطة على موقعي', en: 'Center on my location', fr: 'Centrer sur ma position' },
  // ---- French-explicit baseline (extended set, ~120 more entries) ----
  // These cover the long tail of hard-coded Arabic strings that the
  // DOM overlay would otherwise have to translate via the live API.
  // Pre-seeding them avoids the first-visit latency for French users.
  { ar: 'الرئيسية', en: 'Home', fr: 'Accueil' },
  { ar: 'القائمة', en: 'Menu', fr: 'Menu' },
  { ar: 'الإعدادات', en: 'Settings', fr: 'Paramètres' },
  { ar: 'الملف الشخصي', en: 'Profile', fr: 'Profil' },
  { ar: 'الإشعارات', en: 'Notifications', fr: 'Notifications' },
  { ar: 'المساعدة', en: 'Help', fr: 'Aide' },
  { ar: 'حول', en: 'About', fr: 'À propos' },
  { ar: 'الشروط والأحكام', en: 'Terms & conditions', fr: 'Conditions d’utilisation' },
  { ar: 'سياسة الخصوصية', en: 'Privacy policy', fr: 'Politique de confidentialité' },
  { ar: 'تواصل معنا', en: 'Contact us', fr: 'Nous contacter' },
  { ar: 'الأسئلة الشائعة', en: 'FAQ', fr: 'FAQ' },
  // ---- transit (extended) ----
  { ar: 'الخطوط المتاحة', en: 'Available lines', fr: 'Lignes disponibles' },
  { ar: 'الموقع الحالي', en: 'Current location', fr: 'Position actuelle' },
  { ar: 'حدد الموقع', en: 'Pick a location', fr: 'Choisir un lieu' },
  { ar: 'كيلومتر', en: 'kilometer', fr: 'kilomètre' },
  { ar: 'متر', en: 'meter', fr: 'mètre' },
  { ar: 'ساعة', en: 'hour', fr: 'heure' },
  { ar: 'ساعات', en: 'hours', fr: 'heures' },
  { ar: 'ثانية', en: 'second', fr: 'seconde' },
  { ar: 'ثوانٍ', en: 'seconds', fr: 'secondes' },
  { ar: 'الزحمة شديدة', en: 'Heavy traffic', fr: 'Trafic dense' },
  { ar: 'الزحمة متوسطة', en: 'Moderate traffic', fr: 'Trafic modéré' },
  { ar: 'حركة المرور سلسة', en: 'Smooth traffic', fr: 'Circulation fluide' },
  { ar: 'موقف فاضي', en: 'Empty stop', fr: 'Arrêt vide' },
  { ar: 'موقف زحمة', en: 'Crowded stop', fr: 'Arrêt bondé' },
  { ar: 'ميكروباص متاح', en: 'Microbus available', fr: 'Microbus disponible' },
  { ar: 'لا يوجد ميكروباص', en: 'No microbus', fr: 'Aucun microbus' },
  { ar: 'انتظر دقايق', en: 'Wait a few minutes', fr: 'Patientez quelques minutes' },
  { ar: 'حد ركب من قبلك', en: 'Someone boarded ahead of you', fr: 'Quelqu’un est monté avant vous' },
  // ---- planner (extended) ----
  { ar: 'تفاصيل المسار', en: 'Route details', fr: 'Détails de l’itinéraire' },
  { ar: 'تكلفة الرحلة', en: 'Trip cost', fr: 'Coût du trajet' },
  { ar: 'إجمالي المسافة', en: 'Total distance', fr: 'Distance totale' },
  { ar: 'وقت الانتظار', en: 'Wait time', fr: 'Temps d’attente' },
  { ar: 'انطلاق الآن', en: 'Departing now', fr: 'Départ maintenant' },
  { ar: 'انطلاق لاحقاً', en: 'Departing later', fr: 'Départ plus tard' },
  { ar: 'بدائل أرخص', en: 'Cheaper alternatives', fr: 'Alternatives moins chères' },
  { ar: 'بدائل أسرع', en: 'Faster alternatives', fr: 'Alternatives plus rapides' },
  // ---- admin (extended) ----
  { ar: 'الإدارة', en: 'Administration', fr: 'Administration' },
  { ar: 'إدارة المنصة', en: 'Platform admin', fr: 'Administration de la plateforme' },
  { ar: 'المستأجرون', en: 'Tenants', fr: 'Locataires' },
  { ar: 'الخطط', en: 'Plans', fr: 'Forfaits' },
  { ar: 'الفواتير', en: 'Invoices', fr: 'Factures' },
  { ar: 'المدفوعات', en: 'Payments', fr: 'Paiements' },
  { ar: 'المسودة', en: 'Draft', fr: 'Brouillon' },
  { ar: 'منشور', en: 'Published', fr: 'Publié' },
  { ar: 'في الانتظار', en: 'Pending', fr: 'En attente' },
  { ar: 'مرفوض', en: 'Rejected', fr: 'Rejeté' },
  { ar: 'مقبول', en: 'Approved', fr: 'Approuvé' },
  { ar: 'محذوف', en: 'Deleted', fr: 'Supprimé' },
  { ar: 'العمليات الحية', en: 'Live operations', fr: 'Opérations en direct' },
  { ar: 'إدارة الخطوط', en: 'Manage lines', fr: 'Gérer les lignes' },
  { ar: 'إدارة المحطات', en: 'Manage stations', fr: 'Gérer les stations' },
  { ar: 'استيراد بيانات', en: 'Import data', fr: 'Importer des données' },
  { ar: 'تصدير بيانات', en: 'Export data', fr: 'Exporter des données' },
  // ---- social / growth (extended) ----
  { ar: 'انضم إلى المجتمع', en: 'Join the community', fr: 'Rejoindre la communauté' },
  { ar: 'شارك تجربتك', en: 'Share your experience', fr: 'Partagez votre expérience' },
  { ar: 'صوّت', en: 'Vote', fr: 'Voter' },
  { ar: 'إعجاب', en: 'Like', fr: 'J’aime' },
  { ar: 'تعليق', en: 'Comment', fr: 'Commenter' },
  { ar: 'متابعة', en: 'Follow', fr: 'Suivre' },
  { ar: 'إلغاء المتابعة', en: 'Unfollow', fr: 'Se désabonner' },
  { ar: 'صديق', en: 'Friend', fr: 'Ami' },
  { ar: 'الأصدقاء', en: 'Friends', fr: 'Amis' },
  { ar: 'مجموعة', en: 'Group', fr: 'Groupe' },
  { ar: 'إنشاء مجموعة', en: 'Create group', fr: 'Créer un groupe' },
  { ar: 'دعوة للمجموعة', en: 'Invite to group', fr: 'Inviter au groupe' },
  { ar: 'قناة', en: 'Channel', fr: 'Canal' },
  { ar: 'انضم للقناة', en: 'Join channel', fr: 'Rejoindre le canal' },
  { ar: 'تنبيه', en: 'Alert', fr: 'Alerte' },
  { ar: 'تنبيهات حية', en: 'Live alerts', fr: 'Alertes en direct' },
  { ar: 'حدث طارئ', en: 'Emergency', fr: 'Urgence' },
  // ---- WhatsApp / share (extended) ----
  { ar: 'انسخ الرابط', en: 'Copy link', fr: 'Copier le lien' },
  { ar: 'تم النسخ', en: 'Copied', fr: 'Copié' },
  { ar: 'مشاركة الموقع', en: 'Share location', fr: 'Partager la position' },
  { ar: 'مشاركة الرحلة', en: 'Share trip', fr: 'Partager le trajet' },
  { ar: 'افتح في الخريطة', en: 'Open in map', fr: 'Ouvrir dans la carte' },
  { ar: 'تعرّض للزحمة', en: 'Exposed to traffic', fr: 'Pris dans les bouchons' },
  { ar: 'وفّرت اليوم', en: 'You saved today', fr: 'Économisé aujourd’hui' },
  { ar: 'وفّرت الأسبوع', en: 'You saved this week', fr: 'Économisé cette semaine' },
  { ar: 'وفّرت الشهر', en: 'You saved this month', fr: 'Économisé ce mois-ci' },
  // ---- onboarding ----
  { ar: 'مرحباً بك في مواصلات', en: 'Welcome to Mwasalat', fr: 'Bienvenue sur Mwasalat' },
  { ar: 'لنبدأ', en: 'Let’s get started', fr: 'Commençons' },
  { ar: 'اختر مدينتك', en: 'Choose your city', fr: 'Choisissez votre ville' },
  { ar: 'اسمح بالموقع', en: 'Allow location', fr: 'Autoriser la localisation' },
  { ar: 'تخطّي', en: 'Skip', fr: 'Passer' },
  { ar: 'الخطوة', en: 'Step', fr: 'Étape' },
  { ar: 'انتهيت', en: 'Finished', fr: 'Terminé' },
  // ---- errors / empty states ----
  { ar: 'لا يوجد اتصال بالإنترنت', en: 'No internet connection', fr: 'Pas de connexion Internet' },
  { ar: 'تعذّر تحميل البيانات', en: 'Failed to load data', fr: 'Échec du chargement' },
  { ar: 'لم يتم العثور على نتائج', en: 'No results found', fr: 'Aucun résultat trouvé' },
  { ar: 'انتهت الجلسة، سجّل الدخول مرة أخرى', en: 'Session expired, please sign in again', fr: 'Session expirée, veuillez vous reconnecter' },
  { ar: 'الصفحة غير موجودة', en: 'Page not found', fr: 'Page introuvable' },
  { ar: 'تحتاج صلاحيات إضافية', en: 'You need additional permissions', fr: 'Vous avez besoin de permissions supplémentaires' },
  { ar: 'هذه الميزة تحتاج اشتراك', en: 'This feature requires a subscription', fr: 'Cette fonctionnalité nécessite un abonnement' },
  // ---- billing (extended) ----
  { ar: 'الخطة المجانية', en: 'Free plan', fr: 'Forfait gratuit' },
  { ar: 'الخطة الاحترافية', en: 'Pro plan', fr: 'Forfait professionnel' },
  { ar: 'الخطة المؤسسية', en: 'Enterprise plan', fr: 'Forfait entreprise' },
  { ar: 'شهرياً', en: 'Monthly', fr: 'Mensuel' },
  { ar: 'سنوياً', en: 'Yearly', fr: 'Annuel' },
  { ar: 'تجربة مجانية', en: 'Free trial', fr: 'Essai gratuit' },
  { ar: 'بدء الاشتراك', en: 'Start subscription', fr: 'Démarrer l’abonnement' },
  { ar: 'إلغاء الاشتراك', en: 'Cancel subscription', fr: 'Annuler l’abonnement' },
  { ar: 'تجديد تلقائي', en: 'Auto-renew', fr: 'Renouvellement automatique' },
  { ar: 'طريقة الدفع', en: 'Payment method', fr: 'Mode de paiement' },
  // ---- numbers / formatting helpers ----
  { ar: 'مجاني', en: 'Free', fr: 'Gratuit' },
  { ar: 'الإجمالي', en: 'Total', fr: 'Total' },
  { ar: 'الضريبة', en: 'Tax', fr: 'Taxe' },
  { ar: 'الخصم', en: 'Discount', fr: 'Remise' },
  // ---- French-only refinements (terms a generic translator misses) ----
  { ar: 'حلوان', en: 'Helwan', fr: 'Helwan' },
  { ar: 'المعادي', en: 'Maadi', fr: 'Maadi' },
  { ar: 'مدينة نصر', en: 'Nasr City', fr: 'Nasr City' },
  { ar: 'وسط البلد', en: 'Downtown', fr: 'Centre-ville' },
  { ar: 'التحرير', en: 'Tahrir', fr: 'Tahrir' },
  { ar: 'رمسيس', en: 'Ramses', fr: 'Ramsès' },
  { ar: 'العباسية', en: 'Abbasiya', fr: 'Abbassia' },
  { ar: 'فيصل', en: 'Faisal', fr: 'Faisal' },
  { ar: 'الجيزة', en: 'Giza', fr: 'Gizeh' },
  { ar: 'القاهرة', en: 'Cairo', fr: 'Le Caire' },
  { ar: 'الإسكندرية', en: 'Alexandria', fr: 'Alexandrie' },
  { ar: 'جامعة القاهرة', en: 'Cairo University', fr: 'Université du Caire' },
  { ar: 'محطة مصر', en: 'Misr Station', fr: 'Gare Misr' },
];

function hashSource(text: string): string {
  return createHash('sha256').update(`ar::${text}`).digest('hex');
}

async function main() {
  let inserts = 0;
  let updates = 0;
  for (const entry of OVERRIDES) {
    const sourceHash = hashSource(entry.ar);
    for (const target of ['en', 'fr'] as const) {
      const translated = entry[target];
      const result = await prisma.i18nOverride.upsert({
        where: {
          tenantId_targetLocale_sourceHash_domain: {
            tenantId: null as unknown as string,
            targetLocale: target,
            sourceHash,
            domain: entry.domain ?? 'ui',
          },
        } as any,
        update: {
          translatedText: translated,
          sourceText: entry.ar,
          isActive: true,
        },
        create: {
          tenantId: null,
          sourceLocale: 'ar',
          targetLocale: target,
          sourceHash,
          sourceText: entry.ar,
          translatedText: translated,
          domain: entry.domain ?? 'ui',
          isActive: true,
        },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) inserts += 1;
      else updates += 1;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`OK seed-i18n: ${inserts} inserted, ${updates} updated (entries=${OVERRIDES.length})`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('seed-i18n failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
