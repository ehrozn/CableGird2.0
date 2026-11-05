import json
# TV work schedule + own contact roles
T={
"Back to work at {t} · {x} left": [
"Работа с {t} · осталось {x}",
"Vuelta al trabajo a las {t} · quedan {x}"
],
"Break": [
"Перерыв",
"Descanso"
],
"Briefing": [
"Планёрка",
"Reunión"
],
"Changes appear on the TV right away.": [
"Изменения сразу появляются на экране.",
"Los cambios aparecen en la pantalla al instante."
],
"Day off today": [
"Сегодня выходной",
"Hoy es día libre"
],
"End of the shift in {x}": [
"Конец смены через {x}",
"Fin del turno en {x}"
],
"End of work": [
"Конец работы",
"Fin del trabajo"
],
"Ends before it starts": [
"Заканчивается раньше, чем начинается",
"Termina antes de empezar"
],
"Leave the end empty for a moment in time, e.g. a briefing or a delivery.": [
"Оставьте конец пустым для события в один момент, например планёрки или доставки.",
"Deje el final vacío para un momento puntual, p. ej. una reunión o una entrega."
],
"Lunch": [
"Обед",
"Almuerzo"
],
"Lunch, breaks and briefings": [
"Обед, перерывы и планёрки",
"Almuerzo, descansos y reuniones"
],
"Name, e.g. Clean-up": [
"Название, например Уборка",
"Nombre, p. ej. Limpieza"
],
"Next shift: tomorrow at {t}": [
"Следующая смена: завтра в {t}",
"Próximo turno: mañana a las {t}"
],
"Next shift: {d} at {t}": [
"Следующая смена: {d} в {t}",
"Próximo turno: {d} a las {t}"
],
"Outside working hours — not shown on the TV": [
"Вне рабочего времени — на экране не показывается",
"Fuera del horario: no se muestra en la pantalla"
],
"Schedule is on the TV": [
"Распорядок на экране",
"El horario está en la pantalla"
],
"Schedule removed from the TV": [
"Распорядок убран с экрана",
"Horario quitado de la pantalla"
],
"Set up the schedule": [
"Настроить распорядок",
"Configurar el horario"
],
"Start at {t}": [
"Начало в {t}",
"Inicio a las {t}"
],
"Start of work": [
"Начало работы",
"Inicio del trabajo"
],
"Start, lunch, breaks and end of the day. The TV counts down to each: “Lunch in 25 min”.": [
"Начало, обед, перерывы и конец дня. Экран ведёт отсчёт до каждого: «Обед через 25 мин».",
"Inicio, almuerzo, descansos y fin del día. La pantalla cuenta el tiempo hasta cada uno: «Almuerzo en 25 min»."
],
"The end of work is before the start": [
"Конец работы раньше начала",
"El fin del trabajo es anterior al inicio"
],
"The shift is over": [
"Смена окончена",
"El turno terminó"
],
"Who is this? e.g. Electrician on call": [
"Кто это? Например, Дежурный электрик",
"¿Quién es? p. ej. Electricista de guardia"
],
"Work schedule": [
"Распорядок дня",
"Horario de trabajo"
],
"Work starts in {x}": [
"Начало работы через {x}",
"El trabajo empieza en {x}"
],
"Working days": [
"Рабочие дни",
"Días laborables"
],
"at {t}": [
"в {t}",
"a las {t}"
],
"{h} h": [
"{h} ч",
"{h} h"
],
"{h} h {m} min": [
"{h} ч {m} мин",
"{h} h {m} min"
],
"{n} min": [
"{n} мин",
"{n} min"
],
"{what} in {x}": [
"{what} через {x}",
"{what} en {x}"
],
"{what} now": [
"Сейчас: {what}",
"Ahora: {what}"
],
"Own role": [
"Своя роль",
"Rol propio"
],
"Own name": [
"Своё название",
"Nombre propio"
],
"Electrician on call": [
"Дежурный электрик",
"Electricista de guardia"
],
"Site guard": [
"Охрана объекта",
"Vigilante de obra"
],
"General contractor": [
"Генподрядчик",
"Contratista general"
],
"Client representative": [
"Представитель заказчика",
"Representante del cliente"
],
"First aid": [
"Первая помощь",
"Primeros auxilios"
],
"IT / network admin": [
"IT / сетевой администратор",
"TI / administrador de red"
]
}
f='src/lib/i18n-dict.ts'
s=open(f).read()
T={k:v for k,v in T.items() if json.dumps(k,ensure_ascii=False)+':' not in s and f'\n  {k}:' not in s}
idx=[i for i in range(len(s)) if s.startswith('\n};',i)]
ru_end,es_end=idx[0],idx[1]
def block(k):
    return ''.join(f'\n  {json.dumps(key,ensure_ascii=False)}: {json.dumps(v[k],ensure_ascii=False)},' for key,v in T.items())
s=s[:es_end]+block(1)+s[es_end:]
s=s[:ru_end]+block(0)+s[ru_end:]
open(f,'w').write(s)
print('added',len(T))
