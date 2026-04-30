import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TrueCalendarGridProps {
  history: any[];
  isRtl: boolean;
}

export default function TrueCalendarGrid({ history, isRtl }: TrueCalendarGridProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthNamesAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  
  const dayNamesEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayNamesAr = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  const days = [];
  for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8 sm:w-10 sm:h-10"></div>);
  }

  for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const record = history.find(h => h.date === dateStr);
      let bgClass = "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300";
      if (record?.wasActive && record?.freezeUsed) bgClass = "bg-sky-400 dark:bg-sky-500 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-600 ring-offset-1 dark:ring-offset-zinc-900";
      else if (record?.wasActive) bgClass = "bg-orange-500 dark:bg-orange-600 text-white shadow-sm ring-2 ring-orange-300 dark:ring-orange-600 ring-offset-1 dark:ring-offset-zinc-900";

      days.push(
          <div key={d} title={dateStr} className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl text-sm font-bold transition-all hover:opacity-80 ${bgClass}`}>
              {d}
          </div>
      );
  }

  return (
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 p-4 shadow-sm w-full mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <ChevronLeft className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${isRtl ? 'rotate-180' : ''}`} />
              </button>
              <div className="font-black text-lg text-slate-800 dark:text-slate-200">
                  {isRtl ? monthNamesAr[month] : monthNamesEn[month]} {year}
              </div>
              <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-slate-600 dark:text-slate-400">
                  <ChevronRight className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${isRtl ? 'rotate-180' : ''}`} />
              </button>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center mb-3">
              {(isRtl ? dayNamesAr : dayNamesEn).map((day, i) => (
                  <div key={i} className="text-[11px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">{day}</div>
              ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2 place-items-center">
              {days}
          </div>
          <div className="flex gap-4 justify-center items-center mt-6 text-xs font-bold text-slate-500 dark:text-slate-400 pt-4 border-t border-slate-50 dark:border-zinc-800/50">
               <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-slate-100 dark:bg-zinc-800 rounded-sm"></div> {isRtl ? 'غير نشط' : 'Inactive'}</div>
               <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-500 dark:bg-orange-600 rounded-sm shadow-sm"></div> {isRtl ? 'نشط' : 'Active'}</div>
               <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-sky-400 dark:bg-sky-500 rounded-sm shadow-sm"></div> {isRtl ? 'تجميد' : 'Freeze'}</div>
          </div>
      </div>
  );
}
