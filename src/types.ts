export type Category = 'pharmacology' | 'pharmacognosy' | 'organic_chemistry' | 'biochemistry' | 'cosmetics';
export type LectureType = 'theoretical' | 'practical';

export interface Lecture {
  id: string;
  title: string;
  category: Category;
  type: LectureType;
  description?: string;
  pdfUrl: string;
  youtubeUrl?: string;
  createdAt: any; // Firestore Timestamp
  uploadedBy: string;
  uploaderName?: string;
  number?: number;
  isWeekly?: boolean;
  version?: 'original' | 'translated';
}

export interface Post {
  id: string;
  content: string;
  createdAt: any;
  createdBy: string;
  authorName: string;
  authorPhotoUrl?: string;
  type?: 'text' | 'image' | 'video' | 'file';
  text?: string;
  date?: any;
  imageUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  linkUrl?: string;
  linkTitle?: string;
}

export interface RecordItem {
  id: string;
  title: string;
  category: Category;
  type: LectureType;
  description?: string;
  audioUrl: string;
  duration?: number; // Duration in seconds
  size?: number; // File size in MB
  createdAt: any;
  uploadedBy: string;
  uploaderName?: string;
  number?: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  originalName?: string;
  email: string;
  role: 'admin' | 'moderator' | 'student';
  photoUrl?: string;
  completedWeeklyTasks?: string[];
  favorites?: string[];
  studied?: string[];
  streakCount?: number;
  lastActiveDate?: string;
  examCode?: string;
  group?: string;
  notificationPreferences?: {
    lectures: boolean;
    announcements: boolean;
    chat?: boolean;
    records?: boolean;
    homeworks?: boolean;
  };
  permissions?: {
    manageLectures: boolean;
    manageAnnouncements: boolean;
    manageRecords: boolean;
    manageChat: boolean;
    manageHomeworks: boolean;
    manageStudents: boolean;
    manageAdmins?: boolean;
  };
  memberSince?: any;
  hideNameOnLeaderboard?: boolean;
  hidePhotoOnLeaderboard?: boolean;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  password?: string; // Hashed password
  examCode: string;
  isActive: boolean;
  createdAt: any;
  currentName?: string; // Appended from users collection
}

export interface Homework {
  id: string;
  subject: Category;
  type: LectureType | 'both';
  lectures: { label: string; lectureId: string }[];
  note?: string;
  createdAt: any;
  dueDate?: any;
}

export type Language = 'ar' | 'en';

export const TRANSLATIONS = {
  ar: {
    appName: 'محاضراتي',
    university: 'جامعة الصفوة',
    department: 'قسم الصيدلة',
    byFenix: 'بواسطة فينيكس',
    searchPlaceholder: 'البحث عن المحاضرات...',
    upload: 'رفع',
    adminPortal: 'بوابة المسؤول',
    allSubjects: 'جميع المواد',
    loading: 'جاري التحميل...',
    noLectures: 'لم يتم العثور على محاضرات',
    noLecturesDesc: 'لم نتمكن من العثور على أي محاضرات تطابق الفلاتر الحالية أو استعلام البحث.',
    view: 'عرض',
    download: 'تحميل',
    theoretical: 'نظري',
    practical: 'عملي',
    recently: 'مؤخراً',
    adminAccess: 'دخول المسؤول',
    enterPassword: 'أدخل كلمة المرور لإدارة المحاضرات',
    verifyPassword: 'تحقق من كلمة المرور',
    confirmIdentity: 'تأكيد الهوية عبر جوجل',
    passwordCorrect: 'كلمة المرور صحيحة! يرجى تسجيل الدخول بحساب جوجل المسؤول لتأكيد الهوية.',
    incorrectPassword: 'كلمة مرور غير صحيحة',
    publishLecture: 'نشر المحاضرة',
    uploading: 'جاري الرفع...',
    lectureTitle: 'عنوان المحاضرة',
    lectureNumber: 'رقم المحاضرة (اختياري)',
    pdfFile: 'ملف PDF',
    description: 'الوصف (اختياري)',
    category: 'المادة',
    type: 'النوع',
    clickToUpload: 'اضغط لرفع ملف PDF',
    maxSize: 'الحد الأقصى 10 ميجابايت',
    dragDrop: 'أو اسحب وأفلت الملف هنا',
    success: 'تم الرفع بنجاح!',
    uploadAnother: 'رفع محاضرة أخرى',
    close: 'إغلاق',
    errorNetwork: 'خطأ في الشبكة. يرجى التحقق من اتصالك بالإنترنت.',
    errorUnauthorized: 'ليس لديك صلاحية للقيام بهذا الإجراء.',
    errorQuota: 'تم تجاوز حصة التخزين. يرجى التواصل مع الدعم.',
    errorUnknown: 'حدث خطأ غير معروف أثناء الرفع.',
    allRights: 'جميع الحقوق محفوظة.',
    manageAdmins: 'إدارة المسؤولين',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    addAdmin: 'إضافة مسؤول',
    adminList: 'قائمة المسؤولين',
    delete: 'حذف',
    subAdminLogin: 'دخول المسؤولين (اسم مستخدم)',
    login: 'تسجيل الدخول',
    invalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة',
    adminCreated: 'تم إنشاء المسؤول بنجاح',
    confirmDeleteAdmin: 'هل أنت متأكد من حذف هذا المسؤول؟',
    confirmDeleteLecture: 'هل أنت متأكد من حذف هذه المحاضرة؟ لا يمكن التراجع عن هذا الإجراء.',
    deleteLecture: 'حذف المحاضرة',
    editLecture: 'تعديل المحاضرة',
    saveChanges: 'حفظ التغييرات',
    editSuccess: 'تم التعديل بنجاح!',
    sortBy: 'ترتيب حسب',
    sortTitle: 'العنوان',
    sortDate: 'تاريخ الرفع',
    sortNumber: 'رقم المحاضرة',
    sortAsc: 'تصاعدي',
    sortDesc: 'تنازلي',
    pharmacyPortal: 'بوابة الصيدلة',
    resourceHub: 'محاضرات المرحلة الثالثة',
    pharmacology: 'فارما',
    pharmacognosy: ' عقاقير',
    organic_chemistry: 'عضوية',
    biochemistry: 'بايو',
    cosmetics: 'تكنو',
    navAnnouncements: 'تبليغات',
    navLectures: 'محاضرات',
    navWeekly: 'واجبات الأسبوع',
    navProfile: 'الملف الشخصي',
    navRecords: 'تسجيلات',
    navChat: 'الدردشة',
    original: 'أصلي',
    translated: 'مترجم',
    addToWeekly: 'إضافة لواجبات الأسبوع',
    createPost: 'إنشاء منشور',
    postContent: 'محتوى المنشور',
    publishPost: 'نشر',
    noPosts: 'لا توجد تبليغات حالياً',
    weeklyTasks: 'الواجبات',
    noWeeklyTasks: 'لا توجد واجبات لهذا الأسبوع',
    markCompleted: 'تحديد كمكتمل',
    completed: 'مكتمل',
    manageDownloads: 'إدارة المحاضرات المفضلة',
    offlineDownloads: 'محاضرات مفضلة',
    clearAll: 'مسح الكل',
    noDownloads: 'لا توجد محاضرات مفضلة',
    remove: 'إزالة',
    postHomework: 'إضافة واجب',
    editHomework: 'تعديل واجب',
    both: 'عملي ونظري',
    dueDate: 'تاريخ التسليم / الامتحان',
    examLectures: 'محاضرات الامتحان',
    addLecture: 'إضافة محاضرة',
    additionalNote: 'ملاحظة إضافية (اختياري)',
    examIncludes: 'الامتحان يتضمن:',
    confirmClearAll: 'هل أنت متأكد من مسح جميع المفضلة؟',
    confirmDeleteHomework: 'هل أنت متأكد من حذف هذا الواجب؟',
    studied: 'درستها',
    markStudied: 'تحديد كمدروسة',
    unmarkStudied: 'إلغاء التحديد',
    addToFavorites: 'إضافة للمفضلة',
    removeFromFavorites: 'إزالة من المفضلة',
    youtubeTag: 'شرح يوتيوب',
  },
  en: {
    appName: 'محاضراتي',
    university: 'ALSAFWA UNIVERSITY',
    department: 'Pharmacy Department',
    byFenix: 'By Fenix',
    searchPlaceholder: 'Search lectures...',
    upload: 'Upload',
    adminPortal: 'Admin Portal',
    allSubjects: 'All Subjects',
    loading: 'Loading lectures...',
    noLectures: 'No lectures found',
    noLecturesDesc: "We couldn't find any lectures matching your current filters or search query.",
    view: 'View',
    download: 'Download',
    theoretical: 'Theoretical',
    practical: 'Practical',
    recently: 'Recently',
    adminAccess: 'Admin Access',
    enterPassword: 'Enter password to manage lectures',
    verifyPassword: 'Verify Password',
    confirmIdentity: 'Confirm Identity with Google',
    passwordCorrect: 'Password correct! Please sign in with your Google Admin account to confirm identity.',
    incorrectPassword: 'Incorrect password',
    publishLecture: 'Publish Lecture',
    uploading: 'Uploading...',
    lectureTitle: 'Lecture Title',
    lectureNumber: 'Lecture Number (Optional)',
    pdfFile: 'PDF File',
    description: 'Description (Optional)',
    category: 'Category',
    type: 'Type',
    clickToUpload: 'Click to upload PDF file',
    maxSize: 'Max 10MB',
    dragDrop: 'or drag and drop file here',
    success: 'Upload Successful!',
    uploadAnother: 'Upload another lecture',
    close: 'Close',
    errorNetwork: 'Network error. Please check your internet connection.',
    errorUnauthorized: 'You do not have permission to perform this action.',
    errorQuota: 'Storage quota exceeded. Please contact support.',
    errorUnknown: 'An unknown error occurred during upload.',
    allRights: 'All rights reserved.',
    manageAdmins: 'Manage Admins',
    username: 'Username',
    password: 'Password',
    addAdmin: 'Add Admin',
    adminList: 'Admin List',
    delete: 'Delete',
    subAdminLogin: 'Admin Login (Username)',
    login: 'Login',
    invalidCredentials: 'Invalid username or password',
    adminCreated: 'Admin created successfully',
    confirmDeleteAdmin: 'Are you sure you want to delete this admin?',
    confirmDeleteLecture: 'Are you sure you want to delete this lecture? This action cannot be undone.',
    deleteLecture: 'Delete Lecture',
    editLecture: 'Edit Lecture',
    saveChanges: 'Save Changes',
    editSuccess: 'Changes saved successfully!',
    sortBy: 'Sort by',
    sortTitle: 'Title',
    sortDate: 'Upload Date',
    sortNumber: 'Lecture Number',
    sortAsc: 'Ascending',
    sortDesc: 'Descending',
    pharmacyPortal: 'Pharmacy Portal',
    resourceHub: 'Lecture Resource Hub',
    pharmacology: 'Pharmacology',
    pharmacognosy: 'Pharmacognosy',
    organic_chemistry: 'Organic Chemistry',
    biochemistry: 'Biochemistry',
    cosmetics: 'Cosmetics and Preparations',
    navAnnouncements: 'Announcements',
    navLectures: 'Lectures',
    navWeekly: 'Weekly List',
    navProfile: 'Profile',
    navRecords: 'Records',
    navChat: 'Chat',
    original: 'Original',
    translated: 'Translated',
    addToWeekly: 'Add to Weekly List',
    createPost: 'Create Post',
    postContent: 'Post Content',
    publishPost: 'Publish',
    noPosts: 'No announcements yet',
    weeklyTasks: 'Homework',
    noWeeklyTasks: 'No homework for this week',
    markCompleted: 'Mark Completed',
    completed: 'Completed',
    manageDownloads: 'Manage Favorites',
    offlineDownloads: 'Favorite Lectures',
    clearAll: 'Clear All',
    noDownloads: 'No favorites yet',
    remove: 'Remove',
    postHomework: 'Post Homework',
    editHomework: 'Edit Homework',
    both: 'Theo & Prac',
    dueDate: 'Due / Exam Date',
    examLectures: 'Exam Lectures',
    addLecture: 'Add Lecture',
    additionalNote: 'Additional Note (Optional)',
    examIncludes: 'Exam includes:',
    confirmClearAll: 'Are you sure you want to clear all favorites?',
    confirmDeleteHomework: 'Are you sure you want to delete this homework?',
    studied: 'Studied',
    markStudied: 'Mark as Studied',
    unmarkStudied: 'Unmark Studied',
    addToFavorites: 'Add to Favorites',
    removeFromFavorites: 'Remove from Favorites',
    youtubeTag: 'YouTube Video',
  }
};

export const CATEGORIES: { value: Category; labelKey: keyof typeof TRANSLATIONS.en; types: LectureType[] }[] = [
  { value: 'pharmacology', labelKey: 'pharmacology', types: ['theoretical'] },
  { value: 'pharmacognosy', labelKey: 'pharmacognosy', types: ['theoretical', 'practical'] },
  { value: 'organic_chemistry', labelKey: 'organic_chemistry', types: ['theoretical', 'practical'] },
  { value: 'biochemistry', labelKey: 'biochemistry', types: ['theoretical', 'practical'] },
  { value: 'cosmetics', labelKey: 'cosmetics', types: ['theoretical', 'practical'] },
];
