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
  pt: string;
  domain?: string;
}

const TARGET_LOCALES = ['en', 'fr', 'pt'] as const;
type TargetLocale = (typeof TARGET_LOCALES)[number];

/* eslint-disable max-len */
const OVERRIDES: Entry[] = [
  // ---- core CTAs ----
  { ar: 'مواصلات', en: 'Mwasalat', fr: 'Mwasalat', pt: 'Mwasalat', domain: 'brand' },
  { ar: 'اعرف تركب إيه قبل ما تنزل', en: 'Know what to ride before you head out', fr: 'Sachez quoi prendre avant de sortir', pt: 'Saiba o que pegar antes de sair' },
  { ar: 'تسجيل الدخول', en: 'Sign in', fr: 'Se connecter', pt: 'Entrar' },
  { ar: 'إنشاء حساب', en: 'Create account', fr: 'Créer un compte', pt: 'Criar conta' },
  { ar: 'تسجيل الخروج', en: 'Sign out', fr: 'Se déconnecter', pt: 'Sair' },
  { ar: 'البريد الإلكتروني', en: 'Email', fr: 'E-mail', pt: 'E-mail' },
  { ar: 'كلمة المرور', en: 'Password', fr: 'Mot de passe', pt: 'Senha' },
  { ar: 'رمز التحقق', en: 'Verification code', fr: 'Code de vérification', pt: 'Código de verificação' },
  { ar: 'حفظ', en: 'Save', fr: 'Enregistrer', pt: 'Salvar' },
  { ar: 'إلغاء', en: 'Cancel', fr: 'Annuler', pt: 'Cancelar' },
  { ar: 'تأكيد', en: 'Confirm', fr: 'Confirmer', pt: 'Confirmar' },
  { ar: 'حذف', en: 'Delete', fr: 'Supprimer', pt: 'Excluir' },
  { ar: 'تعديل', en: 'Edit', fr: 'Modifier', pt: 'Editar' },
  { ar: 'إضافة', en: 'Add', fr: 'Ajouter', pt: 'Adicionar' },
  { ar: 'بحث', en: 'Search', fr: 'Rechercher', pt: 'Buscar' },
  { ar: 'مشاركة', en: 'Share', fr: 'Partager', pt: 'Compartilhar' },
  { ar: 'مشاركة على واتساب', en: 'Share on WhatsApp', fr: 'Partager sur WhatsApp', pt: 'Compartilhar no WhatsApp' },
  { ar: 'متابعة', en: 'Continue', fr: 'Continuer', pt: 'Continuar' },
  { ar: 'رجوع', en: 'Back', fr: 'Retour', pt: 'Voltar' },
  { ar: 'التالي', en: 'Next', fr: 'Suivant', pt: 'Próximo' },
  { ar: 'تم', en: 'Done', fr: 'Terminé', pt: 'Concluído' },
  { ar: 'جارٍ التحميل...', en: 'Loading…', fr: 'Chargement…', pt: 'Carregando…' },
  { ar: 'لا توجد نتائج', en: 'No results', fr: 'Aucun résultat', pt: 'Sem resultados' },
  { ar: 'حدث خطأ', en: 'Something went wrong', fr: 'Une erreur est survenue', pt: 'Algo deu errado' },
  { ar: 'حاول مرة أخرى', en: 'Try again', fr: 'Réessayer', pt: 'Tentar novamente' },
  // ---- transit domain ----
  { ar: 'محطة', en: 'Station', fr: 'Station', pt: 'Estação' },
  { ar: 'موقف', en: 'Stop', fr: 'Arrêt', pt: 'Parada' },
  { ar: 'خط', en: 'Line', fr: 'Ligne', pt: 'Linha' },
  { ar: 'مسار', en: 'Route', fr: 'Itinéraire', pt: 'Rota' },
  { ar: 'الموقف الأقرب', en: 'Nearest stop', fr: 'Arrêt le plus proche', pt: 'Parada mais próxima' },
  { ar: 'العربيات المتاحة', en: 'Available cars', fr: 'Véhicules disponibles', pt: 'Veículos disponíveis' },
  { ar: 'الزحمة', en: 'Traffic', fr: 'Trafic', pt: 'Trânsito' },
  { ar: 'الأجرة', en: 'Fare', fr: 'Tarif', pt: 'Tarifa' },
  { ar: 'الميكروباص', en: 'Microbus', fr: 'Microbus', pt: 'Micro-ônibus' },
  { ar: 'الأتوبيس', en: 'Bus', fr: 'Bus', pt: 'Ônibus' },
  { ar: 'التاكسي', en: 'Taxi', fr: 'Taxi', pt: 'Táxi' },
  { ar: 'المسار الكامل', en: 'Full route', fr: 'Itinéraire complet', pt: 'Rota completa' },
  { ar: 'المدة المتوقعة', en: 'Estimated time', fr: 'Durée estimée', pt: 'Tempo estimado' },
  { ar: 'وقت الوصول', en: 'Arrival time', fr: 'Heure d’arrivée', pt: 'Horário de chegada' },
  { ar: 'وقت الانطلاق', en: 'Departure time', fr: 'Heure de départ', pt: 'Horário de partida' },
  { ar: 'تتبع الرحلة', en: 'Track this trip', fr: 'Suivre ce trajet', pt: 'Acompanhar esta viagem' },
  { ar: 'بدء الرحلة', en: 'Start trip', fr: 'Commencer le trajet', pt: 'Iniciar viagem' },
  { ar: 'إنهاء الرحلة', en: 'End trip', fr: 'Terminer le trajet', pt: 'Encerrar viagem' },
  { ar: 'شارك معاد وصولي', en: 'Share my ETA', fr: 'Partager mon arrivée', pt: 'Compartilhar minha chegada' },
  { ar: 'بلّغ عن زحمة', en: 'Report traffic', fr: 'Signaler du trafic', pt: 'Relatar trânsito' },
  { ar: 'صحّح الأجرة', en: 'Correct the fare', fr: 'Corriger le tarif', pt: 'Corrigir a tarifa' },
  { ar: 'اقترح بديل', en: 'Suggest an alternative', fr: 'Suggérer une alternative', pt: 'Sugerir alternativa' },
  { ar: 'أضف موقف', en: 'Add a stop', fr: 'Ajouter un arrêt', pt: 'Adicionar parada' },
  { ar: 'أضف خط', en: 'Add a line', fr: 'Ajouter une ligne', pt: 'Adicionar linha' },
  { ar: 'تجربتي', en: 'My experience', fr: 'Mon expérience', pt: 'Minha experiência' },
  // ---- planner ----
  { ar: 'من أين؟', en: 'From?', fr: 'D’où ?', pt: 'De onde?' },
  { ar: 'إلى أين؟', en: 'To?', fr: 'Vers où ?', pt: 'Para onde?' },
  { ar: 'موقعي الحالي', en: 'My current location', fr: 'Ma position actuelle', pt: 'Minha localização atual' },
  { ar: 'خطط رحلتك', en: 'Plan your trip', fr: 'Planifiez votre trajet', pt: 'Planeje sua viagem' },
  { ar: 'أفضل خط', en: 'Best line', fr: 'Meilleure ligne', pt: 'Melhor linha' },
  { ar: 'الخطوط البديلة', en: 'Alternative lines', fr: 'Lignes alternatives', pt: 'Linhas alternativas' },
  // ---- admin ----
  { ar: 'لوحة التحكم', en: 'Dashboard', fr: 'Tableau de bord', pt: 'Painel' },
  { ar: 'الإحصائيات', en: 'Analytics', fr: 'Analytique', pt: 'Análises' },
  { ar: 'المستخدمون', en: 'Users', fr: 'Utilisateurs', pt: 'Usuários' },
  { ar: 'الفريق', en: 'Team', fr: 'Équipe', pt: 'Equipe' },
  { ar: 'الفوترة', en: 'Billing', fr: 'Facturation', pt: 'Faturamento' },
  { ar: 'الاشتراك', en: 'Subscription', fr: 'Abonnement', pt: 'Assinatura' },
  { ar: 'الخطة الحالية', en: 'Current plan', fr: 'Forfait actuel', pt: 'Plano atual' },
  { ar: 'الترقية', en: 'Upgrade', fr: 'Mettre à niveau', pt: 'Atualizar' },
  { ar: 'إدارة الفريق', en: 'Manage team', fr: 'Gérer l’équipe', pt: 'Gerenciar equipe' },
  { ar: 'دعوة عضو', en: 'Invite member', fr: 'Inviter un membre', pt: 'Convidar membro' },
  { ar: 'الأذونات', en: 'Permissions', fr: 'Autorisations', pt: 'Permissões' },
  { ar: 'سجل التدقيق', en: 'Audit log', fr: 'Journal d’audit', pt: 'Log de auditoria' },
  { ar: 'المسودات', en: 'Drafts', fr: 'Brouillons', pt: 'Rascunhos' },
  { ar: 'الاقتراحات', en: 'Suggestions', fr: 'Suggestions', pt: 'Sugestões' },
  { ar: 'مراجعة', en: 'Review', fr: 'Revue', pt: 'Revisão' },
  { ar: 'نشر', en: 'Publish', fr: 'Publier', pt: 'Publicar' },
  { ar: 'موافقة', en: 'Approve', fr: 'Approuver', pt: 'Aprovar' },
  { ar: 'رفض', en: 'Reject', fr: 'Rejeter', pt: 'Rejeitar' },
  // ---- social / growth ----
  { ar: 'صديقي ركب الميكروباص', en: 'My friend boarded', fr: 'Mon ami est monté', pt: 'Meu amigo embarcou' },
  { ar: 'تابع لايف', en: 'Follow live', fr: 'Suivre en direct', pt: 'Seguir ao vivo' },
  { ar: 'انضم للرحلة', en: 'Join trip', fr: 'Rejoindre le trajet', pt: 'Entrar na viagem' },
  { ar: 'الرحلات اليومية', en: 'Daily commutes', fr: 'Trajets quotidiens', pt: 'Trajetos diários' },
  { ar: 'مجتمع الموقف', en: 'Stop community', fr: 'Communauté de l’arrêt', pt: 'Comunidade da parada' },
  { ar: 'كاباتن الموقف', en: 'Stop captains', fr: 'Capitaines de l’arrêt', pt: 'Capitães da parada' },
  { ar: 'لوحة الشرف', en: 'Leaderboard', fr: 'Classement', pt: 'Ranking' },
  { ar: 'مساهماتي', en: 'My contributions', fr: 'Mes contributions', pt: 'Minhas contribuições' },
  { ar: 'ادع صديق', en: 'Invite a friend', fr: 'Inviter un ami', pt: 'Convidar um amigo' },
  { ar: 'ربحت نقاط', en: 'You earned points', fr: 'Vous avez gagné des points', pt: 'Você ganhou pontos' },
  // ---- common phrases & status ----
  { ar: 'مفتوح', en: 'Open', fr: 'Ouvert', pt: 'Aberto' },
  { ar: 'مغلق', en: 'Closed', fr: 'Fermé', pt: 'Fechado' },
  { ar: 'متاح', en: 'Available', fr: 'Disponible', pt: 'Disponível' },
  { ar: 'غير متاح', en: 'Unavailable', fr: 'Indisponible', pt: 'Indisponível' },
  { ar: 'نشط', en: 'Active', fr: 'Actif', pt: 'Ativo' },
  { ar: 'غير نشط', en: 'Inactive', fr: 'Inactif', pt: 'Inativo' },
  { ar: 'دلوقتي', en: 'Right now', fr: 'En ce moment', pt: 'Agora mesmo' },
  { ar: 'منذ دقائق', en: 'Minutes ago', fr: 'Il y a quelques minutes', pt: 'Minutos atrás' },
  { ar: 'اليوم', en: 'Today', fr: 'Aujourd’hui', pt: 'Hoje' },
  { ar: 'أمس', en: 'Yesterday', fr: 'Hier', pt: 'Ontem' },
  { ar: 'بكرة', en: 'Tomorrow', fr: 'Demain', pt: 'Amanhã' },
  // ---- whatsapp share captions (must match planner shareTrip msg) ----
  { ar: 'أنا في الميكروباص، تابعي وصولي لايف', en: 'I’m on the microbus — track me live', fr: 'Je suis dans le microbus — suivez-moi en direct', pt: 'Estou no micro-ônibus — me acompanhe ao vivo' },
  { ar: 'وصلت بسلام', en: 'Arrived safely', fr: 'Bien arrivé(e)', pt: 'Cheguei em segurança' },
  { ar: 'هوصل خلال', en: 'Arriving in', fr: 'Arrivée dans', pt: 'Chegando em' },
  { ar: 'دقيقة', en: 'minute', fr: 'minute', pt: 'minuto' },
  { ar: 'دقايق', en: 'minutes', fr: 'minutes', pt: 'minutos' },
  { ar: 'جنيه', en: 'EGP', fr: 'EGP', pt: 'EGP' },
  // ---- map ----
  { ar: 'الخريطة', en: 'Map', fr: 'Carte', pt: 'Mapa' },
  { ar: 'تكبير', en: 'Zoom in', fr: 'Zoom avant', pt: 'Aproximar' },
  { ar: 'تصغير', en: 'Zoom out', fr: 'Zoom arrière', pt: 'Afastar' },
  { ar: 'مركز الخريطة على موقعي', en: 'Center on my location', fr: 'Centrer sur ma position', pt: 'Centralizar na minha localização' },
  // ---- French-explicit baseline (extended set, ~120 more entries) ----
  // These cover the long tail of hard-coded Arabic strings that the
  // DOM overlay would otherwise have to translate via the live API.
  // Pre-seeding them avoids the first-visit latency for French users.
  { ar: 'الرئيسية', en: 'Home', fr: 'Accueil', pt: 'Início' },
  { ar: 'القائمة', en: 'Menu', fr: 'Menu', pt: 'Menu' },
  { ar: 'الإعدادات', en: 'Settings', fr: 'Paramètres', pt: 'Configurações' },
  { ar: 'الملف الشخصي', en: 'Profile', fr: 'Profil', pt: 'Perfil' },
  { ar: 'الإشعارات', en: 'Notifications', fr: 'Notifications', pt: 'Notificações' },
  { ar: 'المساعدة', en: 'Help', fr: 'Aide', pt: 'Ajuda' },
  { ar: 'حول', en: 'About', fr: 'À propos', pt: 'Sobre' },
  { ar: 'الشروط والأحكام', en: 'Terms & conditions', fr: 'Conditions d’utilisation', pt: 'Termos e condições' },
  { ar: 'سياسة الخصوصية', en: 'Privacy policy', fr: 'Politique de confidentialité', pt: 'Política de privacidade' },
  { ar: 'تواصل معنا', en: 'Contact us', fr: 'Nous contacter', pt: 'Fale conosco' },
  { ar: 'الأسئلة الشائعة', en: 'FAQ', fr: 'FAQ', pt: 'Perguntas frequentes' },
  // ---- transit (extended) ----
  { ar: 'الخطوط المتاحة', en: 'Available lines', fr: 'Lignes disponibles', pt: 'Linhas disponíveis' },
  { ar: 'الموقع الحالي', en: 'Current location', fr: 'Position actuelle', pt: 'Localização atual' },
  { ar: 'حدد الموقع', en: 'Pick a location', fr: 'Choisir un lieu', pt: 'Escolher um local' },
  { ar: 'كيلومتر', en: 'kilometer', fr: 'kilomètre', pt: 'quilômetro' },
  { ar: 'متر', en: 'meter', fr: 'mètre', pt: 'metro' },
  { ar: 'ساعة', en: 'hour', fr: 'heure', pt: 'hora' },
  { ar: 'ساعات', en: 'hours', fr: 'heures', pt: 'horas' },
  { ar: 'ثانية', en: 'second', fr: 'seconde', pt: 'segundo' },
  { ar: 'ثوانٍ', en: 'seconds', fr: 'secondes', pt: 'segundos' },
  { ar: 'الزحمة شديدة', en: 'Heavy traffic', fr: 'Trafic dense', pt: 'Trânsito intenso' },
  { ar: 'الزحمة متوسطة', en: 'Moderate traffic', fr: 'Trafic modéré', pt: 'Trânsito moderado' },
  { ar: 'حركة المرور سلسة', en: 'Smooth traffic', fr: 'Circulation fluide', pt: 'Trânsito tranquilo' },
  { ar: 'موقف فاضي', en: 'Empty stop', fr: 'Arrêt vide', pt: 'Parada vazia' },
  { ar: 'موقف زحمة', en: 'Crowded stop', fr: 'Arrêt bondé', pt: 'Parada lotada' },
  { ar: 'ميكروباص متاح', en: 'Microbus available', fr: 'Microbus disponible', pt: 'Micro-ônibus disponível' },
  { ar: 'لا يوجد ميكروباص', en: 'No microbus', fr: 'Aucun microbus', pt: 'Sem micro-ônibus' },
  { ar: 'انتظر دقايق', en: 'Wait a few minutes', fr: 'Patientez quelques minutes', pt: 'Aguarde alguns minutos' },
  { ar: 'حد ركب من قبلك', en: 'Someone boarded ahead of you', fr: 'Quelqu’un est monté avant vous', pt: 'Alguém embarcou antes de você' },
  // ---- planner (extended) ----
  { ar: 'تفاصيل المسار', en: 'Route details', fr: 'Détails de l’itinéraire', pt: 'Detalhes da rota' },
  { ar: 'تكلفة الرحلة', en: 'Trip cost', fr: 'Coût du trajet', pt: 'Custo da viagem' },
  { ar: 'إجمالي المسافة', en: 'Total distance', fr: 'Distance totale', pt: 'Distância total' },
  { ar: 'وقت الانتظار', en: 'Wait time', fr: 'Temps d’attente', pt: 'Tempo de espera' },
  { ar: 'انطلاق الآن', en: 'Departing now', fr: 'Départ maintenant', pt: 'Partindo agora' },
  { ar: 'انطلاق لاحقاً', en: 'Departing later', fr: 'Départ plus tard', pt: 'Partindo mais tarde' },
  { ar: 'بدائل أرخص', en: 'Cheaper alternatives', fr: 'Alternatives moins chères', pt: 'Alternativas mais baratas' },
  { ar: 'بدائل أسرع', en: 'Faster alternatives', fr: 'Alternatives plus rapides', pt: 'Alternativas mais rápidas' },
  // ---- admin (extended) ----
  { ar: 'الإدارة', en: 'Administration', fr: 'Administration', pt: 'Administração' },
  { ar: 'إدارة المنصة', en: 'Platform admin', fr: 'Administration de la plateforme', pt: 'Administração da plataforma' },
  { ar: 'المستأجرون', en: 'Tenants', fr: 'Locataires', pt: 'Inquilinos' },
  { ar: 'الخطط', en: 'Plans', fr: 'Forfaits', pt: 'Planos' },
  { ar: 'الفواتير', en: 'Invoices', fr: 'Factures', pt: 'Faturas' },
  { ar: 'المدفوعات', en: 'Payments', fr: 'Paiements', pt: 'Pagamentos' },
  { ar: 'المسودة', en: 'Draft', fr: 'Brouillon', pt: 'Rascunho' },
  { ar: 'منشور', en: 'Published', fr: 'Publié', pt: 'Publicado' },
  { ar: 'في الانتظار', en: 'Pending', fr: 'En attente', pt: 'Pendente' },
  { ar: 'مرفوض', en: 'Rejected', fr: 'Rejeté', pt: 'Rejeitado' },
  { ar: 'مقبول', en: 'Approved', fr: 'Approuvé', pt: 'Aprovado' },
  { ar: 'محذوف', en: 'Deleted', fr: 'Supprimé', pt: 'Excluído' },
  { ar: 'العمليات الحية', en: 'Live operations', fr: 'Opérations en direct', pt: 'Operações ao vivo' },
  { ar: 'إدارة الخطوط', en: 'Manage lines', fr: 'Gérer les lignes', pt: 'Gerenciar linhas' },
  { ar: 'إدارة المحطات', en: 'Manage stations', fr: 'Gérer les stations', pt: 'Gerenciar estações' },
  { ar: 'استيراد بيانات', en: 'Import data', fr: 'Importer des données', pt: 'Importar dados' },
  { ar: 'تصدير بيانات', en: 'Export data', fr: 'Exporter des données', pt: 'Exportar dados' },
  // ---- social / growth (extended) ----
  { ar: 'انضم إلى المجتمع', en: 'Join the community', fr: 'Rejoindre la communauté', pt: 'Entre na comunidade' },
  { ar: 'شارك تجربتك', en: 'Share your experience', fr: 'Partagez votre expérience', pt: 'Compartilhe sua experiência' },
  { ar: 'صوّت', en: 'Vote', fr: 'Voter', pt: 'Votar' },
  { ar: 'إعجاب', en: 'Like', fr: 'J’aime', pt: 'Curtir' },
  { ar: 'تعليق', en: 'Comment', fr: 'Commenter', pt: 'Comentar' },
  { ar: 'متابعة', en: 'Follow', fr: 'Suivre', pt: 'Seguir' },
  { ar: 'إلغاء المتابعة', en: 'Unfollow', fr: 'Se désabonner', pt: 'Deixar de seguir' },
  { ar: 'صديق', en: 'Friend', fr: 'Ami', pt: 'Amigo' },
  { ar: 'الأصدقاء', en: 'Friends', fr: 'Amis', pt: 'Amigos' },
  { ar: 'مجموعة', en: 'Group', fr: 'Groupe', pt: 'Grupo' },
  { ar: 'إنشاء مجموعة', en: 'Create group', fr: 'Créer un groupe', pt: 'Criar grupo' },
  { ar: 'دعوة للمجموعة', en: 'Invite to group', fr: 'Inviter au groupe', pt: 'Convidar para o grupo' },
  { ar: 'قناة', en: 'Channel', fr: 'Canal', pt: 'Canal' },
  { ar: 'انضم للقناة', en: 'Join channel', fr: 'Rejoindre le canal', pt: 'Entrar no canal' },
  { ar: 'تنبيه', en: 'Alert', fr: 'Alerte', pt: 'Alerta' },
  { ar: 'تنبيهات حية', en: 'Live alerts', fr: 'Alertes en direct', pt: 'Alertas ao vivo' },
  { ar: 'حدث طارئ', en: 'Emergency', fr: 'Urgence', pt: 'Emergência' },
  // ---- WhatsApp / share (extended) ----
  { ar: 'انسخ الرابط', en: 'Copy link', fr: 'Copier le lien', pt: 'Copiar link' },
  { ar: 'تم النسخ', en: 'Copied', fr: 'Copié', pt: 'Copiado' },
  { ar: 'مشاركة الموقع', en: 'Share location', fr: 'Partager la position', pt: 'Compartilhar localização' },
  { ar: 'مشاركة الرحلة', en: 'Share trip', fr: 'Partager le trajet', pt: 'Compartilhar viagem' },
  { ar: 'افتح في الخريطة', en: 'Open in map', fr: 'Ouvrir dans la carte', pt: 'Abrir no mapa' },
  { ar: 'تعرّض للزحمة', en: 'Exposed to traffic', fr: 'Pris dans les bouchons', pt: 'Preso no trânsito' },
  { ar: 'وفّرت اليوم', en: 'You saved today', fr: 'Économisé aujourd’hui', pt: 'Você economizou hoje' },
  { ar: 'وفّرت الأسبوع', en: 'You saved this week', fr: 'Économisé cette semaine', pt: 'Você economizou esta semana' },
  { ar: 'وفّرت الشهر', en: 'You saved this month', fr: 'Économisé ce mois-ci', pt: 'Você economizou este mês' },
  // ---- onboarding ----
  { ar: 'مرحباً بك في مواصلات', en: 'Welcome to Mwasalat', fr: 'Bienvenue sur Mwasalat', pt: 'Bem-vindo ao Mwasalat' },
  { ar: 'لنبدأ', en: 'Let’s get started', fr: 'Commençons', pt: 'Vamos começar' },
  { ar: 'اختر مدينتك', en: 'Choose your city', fr: 'Choisissez votre ville', pt: 'Escolha sua cidade' },
  { ar: 'اسمح بالموقع', en: 'Allow location', fr: 'Autoriser la localisation', pt: 'Permitir localização' },
  { ar: 'تخطّي', en: 'Skip', fr: 'Passer', pt: 'Pular' },
  { ar: 'الخطوة', en: 'Step', fr: 'Étape', pt: 'Etapa' },
  { ar: 'انتهيت', en: 'Finished', fr: 'Terminé', pt: 'Concluído' },
  // ---- errors / empty states ----
  { ar: 'لا يوجد اتصال بالإنترنت', en: 'No internet connection', fr: 'Pas de connexion Internet', pt: 'Sem conexão com a internet' },
  { ar: 'تعذّر تحميل البيانات', en: 'Failed to load data', fr: 'Échec du chargement', pt: 'Falha ao carregar dados' },
  { ar: 'لم يتم العثور على نتائج', en: 'No results found', fr: 'Aucun résultat trouvé', pt: 'Nenhum resultado encontrado' },
  { ar: 'انتهت الجلسة، سجّل الدخول مرة أخرى', en: 'Session expired, please sign in again', fr: 'Session expirée, veuillez vous reconnecter', pt: 'Sessão expirada, faça login novamente' },
  { ar: 'الصفحة غير موجودة', en: 'Page not found', fr: 'Page introuvable', pt: 'Página não encontrada' },
  { ar: 'تحتاج صلاحيات إضافية', en: 'You need additional permissions', fr: 'Vous avez besoin de permissions supplémentaires', pt: 'Você precisa de permissões adicionais' },
  { ar: 'هذه الميزة تحتاج اشتراك', en: 'This feature requires a subscription', fr: 'Cette fonctionnalité nécessite un abonnement', pt: 'Este recurso requer uma assinatura' },
  // ---- billing (extended) ----
  { ar: 'الخطة المجانية', en: 'Free plan', fr: 'Forfait gratuit', pt: 'Plano gratuito' },
  { ar: 'الخطة الاحترافية', en: 'Pro plan', fr: 'Forfait professionnel', pt: 'Plano Pro' },
  { ar: 'الخطة المؤسسية', en: 'Enterprise plan', fr: 'Forfait entreprise', pt: 'Plano Enterprise' },
  { ar: 'شهرياً', en: 'Monthly', fr: 'Mensuel', pt: 'Mensal' },
  { ar: 'سنوياً', en: 'Yearly', fr: 'Annuel', pt: 'Anual' },
  { ar: 'تجربة مجانية', en: 'Free trial', fr: 'Essai gratuit', pt: 'Avaliação gratuita' },
  { ar: 'بدء الاشتراك', en: 'Start subscription', fr: 'Démarrer l’abonnement', pt: 'Iniciar assinatura' },
  { ar: 'إلغاء الاشتراك', en: 'Cancel subscription', fr: 'Annuler l’abonnement', pt: 'Cancelar assinatura' },
  { ar: 'تجديد تلقائي', en: 'Auto-renew', fr: 'Renouvellement automatique', pt: 'Renovação automática' },
  { ar: 'طريقة الدفع', en: 'Payment method', fr: 'Mode de paiement', pt: 'Método de pagamento' },
  // ---- numbers / formatting helpers ----
  { ar: 'مجاني', en: 'Free', fr: 'Gratuit', pt: 'Grátis' },
  { ar: 'الإجمالي', en: 'Total', fr: 'Total', pt: 'Total' },
  { ar: 'الضريبة', en: 'Tax', fr: 'Taxe', pt: 'Imposto' },
  { ar: 'الخصم', en: 'Discount', fr: 'Remise', pt: 'Desconto' },
  // ---- French-only refinements (terms a generic translator misses) ----
  { ar: 'حلوان', en: 'Helwan', fr: 'Helwan', pt: 'Helwan' },
  { ar: 'المعادي', en: 'Maadi', fr: 'Maadi', pt: 'Maadi' },
  { ar: 'مدينة نصر', en: 'Nasr City', fr: 'Nasr City', pt: 'Nasr City' },
  { ar: 'وسط البلد', en: 'Downtown', fr: 'Centre-ville', pt: 'Centro' },
  { ar: 'التحرير', en: 'Tahrir', fr: 'Tahrir', pt: 'Tahrir' },
  { ar: 'رمسيس', en: 'Ramses', fr: 'Ramsès', pt: 'Ramsés' },
  { ar: 'العباسية', en: 'Abbasiya', fr: 'Abbassia', pt: 'Abbássia' },
  { ar: 'فيصل', en: 'Faisal', fr: 'Faisal', pt: 'Faisal' },
  { ar: 'الجيزة', en: 'Giza', fr: 'Gizeh', pt: 'Gizé' },
  { ar: 'القاهرة', en: 'Cairo', fr: 'Le Caire', pt: 'Cairo' },
  { ar: 'الإسكندرية', en: 'Alexandria', fr: 'Alexandrie', pt: 'Alexandria' },
  { ar: 'جامعة القاهرة', en: 'Cairo University', fr: 'Université du Caire', pt: 'Universidade do Cairo' },
  { ar: 'محطة مصر', en: 'Misr Station', fr: 'Gare Misr', pt: 'Estação Misr' },
];

function hashSource(text: string): string {
  return createHash('sha256').update(`ar::${text}`).digest('hex');
}

async function main() {
  let inserts = 0;
  let updates = 0;
  for (const entry of OVERRIDES) {
    const sourceHash = hashSource(entry.ar);
    for (const target of TARGET_LOCALES) {
      const translated = entry[target];
      if (!translated) continue;
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
    // Also seed an English-source override for unbundled locales (pt),
    // so when the frozen SPA falls back to English the overlay can
    // translate from English directly without relying on the runtime
    // provider chain. Same source phrase keyed by the EN hash.
    const enHash = createHash('sha256').update(`en::${entry.en}`).digest('hex');
    for (const target of TARGET_LOCALES) {
      if (target === 'en') continue;
      const translated = entry[target];
      if (!translated) continue;
      await prisma.i18nOverride
        .upsert({
          where: {
            tenantId_targetLocale_sourceHash_domain: {
              tenantId: null as unknown as string,
              targetLocale: target,
              sourceHash: enHash,
              domain: entry.domain ?? 'ui',
            },
          } as any,
          update: {
            translatedText: translated,
            sourceText: entry.en,
            isActive: true,
          },
          create: {
            tenantId: null,
            sourceLocale: 'en',
            targetLocale: target,
            sourceHash: enHash,
            sourceText: entry.en,
            translatedText: translated,
            domain: entry.domain ?? 'ui',
            isActive: true,
          },
        })
        .catch(() => undefined);
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `OK seed-i18n: ${inserts} inserted, ${updates} updated ` +
      `(entries=${OVERRIDES.length}, locales=${TARGET_LOCALES.join('+')})`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('seed-i18n failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
