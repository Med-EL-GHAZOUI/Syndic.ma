// Public landing page: FR/AR switch for static content marked with data-i18n.
const KEY = 'syndicma.lang';

const T = {
  fr: {
    'nav.features': 'Fonctionnalités', 'nav.roles': 'Pour qui', 'nav.pricing': 'Tarifs', 'nav.login': 'Se connecter', 'nav.demo': 'Essayer la démo',
    'hero.title': 'La gestion de copropriété au Maroc, enfin simple et transparente.',
    'hero.lead': 'Appels de fonds, paiements, dépenses, assemblées générales, réclamations et documents : un seul outil pour les sociétés de syndic, leurs équipes et les résidents.',
    'hero.cta1': 'Explorer la démo', 'hero.cta2': 'Découvrir les modules', 'hero.small': 'Prototype de démonstration — données fictives, paiements et authentification simulés.',
    'mock.rate': 'Recouvrement', 'mock.collected': 'Encaissé', 'mock.overdue': 'Impayés',
    'feat.title': 'Tout ce dont un syndic a besoin', 'feat.lead': 'Des modules pensés pour la réalité des résidences marocaines, en français et en arabe.',
    'f1.t': 'Appels de fonds et charges', 'f1.p': 'Répartition automatique par tantièmes, échéances, relances et suivi des impayés lot par lot.',
    'f2.t': 'Paiements et reçus', 'f2.p': 'Paiements partiels, reçus numérotés, annulations tracées et relevés de compte. Aucun paiement confirmé n\'est effacé.',
    'f3.t': 'Dépenses et prestataires', 'f3.p': 'Factures fournisseurs, circuit d\'approbation, annuaire d\'entreprises et suivi du budget.',
    'f4.t': 'Réclamations et maintenance', 'f4.p': 'Les résidents signalent, l\'équipe assigne, le prestataire intervient : tout est suivi jusqu\'à la clôture.',
    'f5.t': 'Assemblées générales', 'f5.p': 'Convocations, présences et procurations, votes pondérés par tantièmes, procès-verbaux imprimables.',
    'f6.t': 'Annonces et documents', 'f6.p': 'Informez les résidents, partagez règlements et procès-verbaux avec des droits de visibilité précis.',
    'roles.title': 'Un espace pour chaque acteur', 'roles.lead': 'Sept rôles, des droits distincts et des données cloisonnées par société de syndic.',
    'r1.t': 'Administrateur syndic', 'r1.p': 'Pilote la société, les résidences, les équipes et les finances.',
    'r2.t': 'Gestionnaire', 'r2.p': 'Gère le quotidien des résidences qui lui sont confiées.',
    'r3.t': 'Comptable', 'r3.p': 'Valide les paiements, approuve les dépenses, produit les états.',
    'r4.t': 'Propriétaire et locataire', 'r4.p': 'Suit ses charges, déclare ses paiements, signale un problème.',
    'r5.t': 'Prestataire', 'r5.p': 'Reçoit ses interventions et rend compte du travail réalisé.',
    'r6.t': 'Super administrateur', 'r6.p': 'Administre la plateforme, les organisations et les abonnements.',
    'price.title': 'Des offres selon la taille de votre parc', 'price.lead': 'Tarifs indicatifs du prototype, en dirhams marocains.',
    'p1.t': 'Starter', 'p1.d': 'Jusqu\'à 50 lots', 'p2.t': 'Pro', 'p2.d': 'Jusqu\'à 200 lots', 'p3.t': 'Business', 'p3.d': 'Lots illimités', 'price.month': 'MAD / mois',
    'p.i1': 'Tous les modules', 'p.i2': 'Français et arabe (RTL)', 'p.i3': 'Résidents illimités', 'p.i4': 'Support par e-mail',
    'note': 'Transparence : cette version est un prototype. Les données sont stockées dans votre navigateur, l\'authentification est simulée et aucun paiement réel n\'est traité. Les aspects juridiques (loi 18-00, loi 09-08/CNDP) seront validés avec des professionnels avant toute mise en production.',
    'foot.rights': '© Syndic.ma — prototype de démonstration',
  },
  ar: {
    'nav.features': 'الميزات', 'nav.roles': 'لمن؟', 'nav.pricing': 'الأسعار', 'nav.login': 'تسجيل الدخول', 'nav.demo': 'جرّب النسخة التجريبية',
    'hero.title': 'تدبير الملكية المشتركة بالمغرب، أخيراً بسهولة وشفافية.',
    'hero.lead': 'نداءات الأموال والأداءات والمصاريف والجموع العامة والشكايات والوثائق: أداة واحدة لشركات السنديك وفرقها والسكان.',
    'hero.cta1': 'استكشف النسخة التجريبية', 'hero.cta2': 'اكتشف الوحدات', 'hero.small': 'نموذج تجريبي — بيانات وهمية، والأداءات والمصادقة محاكاة.',
    'mock.rate': 'نسبة التحصيل', 'mock.collected': 'المحصَّل', 'mock.overdue': 'المتأخرات',
    'feat.title': 'كل ما يحتاجه السنديك', 'feat.lead': 'وحدات مصممة لواقع الإقامات المغربية، بالعربية والفرنسية.',
    'f1.t': 'نداءات الأموال والواجبات', 'f1.p': 'توزيع تلقائي حسب الحصص، وآجال الاستحقاق، وتتبع المتأخرات وحدة بوحدة.',
    'f2.t': 'الأداءات والوصولات', 'f2.p': 'أداءات جزئية ووصولات مرقمة وإلغاءات موثَّقة وكشوف حساب. لا تُمحى أي دفعة مؤكدة.',
    'f3.t': 'المصاريف ومقدمو الخدمات', 'f3.p': 'فواتير الموردين ومسار المصادقة ودليل المقاولات وتتبع الميزانية.',
    'f4.t': 'الشكايات والصيانة', 'f4.p': 'السكان يبلغون، والفريق يسند، ومقدم الخدمة ينجز: كل شيء متتبَّع إلى حين الإغلاق.',
    'f5.t': 'الجموع العامة', 'f5.p': 'استدعاءات وحضور وتوكيلات وتصويت مرجَّح بالحصص ومحاضر قابلة للطباعة.',
    'f6.t': 'الإعلانات والوثائق', 'f6.p': 'أخبر السكان وشارك الأنظمة والمحاضر بصلاحيات رؤية دقيقة.',
    'roles.title': 'فضاء لكل متدخل', 'roles.lead': 'سبعة أدوار وصلاحيات متمايزة وبيانات معزولة لكل شركة سنديك.',
    'r1.t': 'مدير شركة السنديك', 'r1.p': 'يقود الشركة والإقامات والفرق والمالية.',
    'r2.t': 'مسير', 'r2.p': 'يدبّر الشأن اليومي للإقامات المسندة إليه.',
    'r3.t': 'محاسب', 'r3.p': 'يؤكد الأداءات ويصادق على المصاريف ويعد الحصيلات.',
    'r4.t': 'مالك ومكتر', 'r4.p': 'يتتبع واجباته ويصرح بأدائه ويبلغ عن أي مشكل.',
    'r5.t': 'مقدم خدمة', 'r5.p': 'يتوصل بتدخلاته ويقدم تقريراً عن عمله.',
    'r6.t': 'المدير العام للمنصة', 'r6.p': 'يدبّر المنصة والمؤسسات والاشتراكات.',
    'price.title': 'عروض حسب حجم محفظتكم', 'price.lead': 'أسعار إرشادية للنموذج التجريبي، بالدرهم المغربي.',
    'p1.t': 'Starter', 'p1.d': 'حتى 50 وحدة', 'p2.t': 'Pro', 'p2.d': 'حتى 200 وحدة', 'p3.t': 'Business', 'p3.d': 'وحدات غير محدودة', 'price.month': 'درهم / شهر',
    'p.i1': 'جميع الوحدات', 'p.i2': 'العربية والفرنسية (RTL)', 'p.i3': 'سكان بلا حدود', 'p.i4': 'دعم عبر البريد الإلكتروني',
    'note': 'للشفافية: هذه النسخة نموذج تجريبي. البيانات مخزنة في متصفحك، والمصادقة محاكاة، ولا تتم معالجة أي أداء حقيقي. ستتم مراجعة الجوانب القانونية (قانون 18-00 وقانون 09-08/CNDP) مع مختصين قبل أي إطلاق فعلي.',
    'foot.rights': '© Syndic.ma — نموذج تجريبي',
  },
};

function currentLang() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fr' || v === 'ar') return v;
  } catch {
    /* ignore */
  }
  return 'fr';
}

function apply(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const text = T[lang][el.dataset.i18n];
    if (text !== undefined) el.textContent = text;
  });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = lang === 'ar' ? 'Syndic.ma — تدبير الملكية المشتركة بالمغرب' : 'Syndic.ma — Gestion de copropriété au Maroc';
}

document.querySelectorAll('[data-lang]').forEach((b) => {
  b.addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, b.dataset.lang);
    } catch {
      /* ignore */
    }
    apply(b.dataset.lang);
  });
});

apply(currentLang());
