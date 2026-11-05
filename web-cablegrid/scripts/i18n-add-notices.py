import json
# TV announcements & news
T={
"1 week": [
"1 неделя",
"1 semana"
],
"3 days": [
"3 дня",
"3 días"
],
"Announcement deleted": [
"Объявление удалено",
"Anuncio eliminado"
],
"Announcement is on the TV": [
"Объявление на экране",
"El anuncio está en la pantalla"
],
"Announcement scheduled": [
"Объявление запланировано",
"Anuncio programado"
],
"Announcement updated": [
"Объявление обновлено",
"Anuncio actualizado"
],
"Announcements & news": [
"Объявления и новости",
"Anuncios y noticias"
],
"Crawls along the bottom of the TV screen.": [
"Бегущей строкой внизу ТВ-экрана.",
"Se desplaza por la parte inferior de la pantalla."
],
"From {d}": [
"С {d}",
"Desde {d}"
],
"Good news": [
"Хорошая новость",
"Buena noticia"
],
"Headline, e.g. Safety briefing at 7:30": [
"Заголовок, например: Инструктаж по ТБ в 7:30",
"Titular, p. ej. Charla de seguridad a las 7:30"
],
"Hide from the TV": [
"Скрыть с экрана",
"Ocultar de la pantalla"
],
"Important": [
"Важно",
"Importante"
],
"New announcement": [
"Новое объявление",
"Nuevo anuncio"
],
"News": [
"Новости",
"Noticias"
],
"No announcements yet. Add a safety rule, a delivery or good news — the TV shows it right away.": [
"Объявлений пока нет. Добавьте правило безопасности, доставку или хорошую новость — экран покажет сразу.",
"Aún no hay anuncios. Agregue una regla de seguridad, una entrega o una buena noticia: la pantalla la muestra al instante."
],
"Safety": [
"Безопасность",
"Seguridad"
],
"Safety and important notices show as a bold strip under the board header. News and good news crawl along the bottom.": [
"Безопасность и важное — яркой полосой под шапкой доски. Новости и хорошие новости — бегущей строкой внизу.",
"Seguridad e importante: una franja destacada bajo el encabezado. Noticias y buenas noticias: se desplazan por la parte inferior."
],
"Show on the TV": [
"Показать на экране",
"Mostrar en la pantalla"
],
"Shown as a bold strip under the header, one at a time.": [
"Яркой полосой под шапкой, по одному.",
"Una franja destacada bajo el encabezado, de a uno."
],
"Today only": [
"Только сегодня",
"Solo hoy"
],
"Until": [
"До",
"Hasta"
],
"From": [
"С",
"Desde"
],
"Until removed": [
"Пока не уберу",
"Hasta quitarlo"
],
"Until {d}": [
"До {d}",
"Hasta {d}"
],
"{n} on the TV": [
"на экране: {n}",
"{n} en pantalla"
],
"“Until” is before “From”": [
"«До» раньше, чем «С»",
"«Hasta» es anterior a «Desde»"
],
"On the TV now": [
"Сейчас на экране",
"En pantalla ahora"
],
"Scheduled": [
"Запланировано",
"Programado"
],
"Expired": [
"Истекло",
"Vencido"
],
"Hidden": [
"Скрыто",
"Oculto"
],
"Hard hats, vests and safety boots on site at all times": [
"Каски, жилеты и защитная обувь — на объекте всегда",
"Casco, chaleco y botas de seguridad en obra en todo momento"
],
"Safety briefing at 7:30 at the site office": [
"Инструктаж по ТБ в 7:30 в прорабской",
"Charla de seguridad a las 7:30 en la oficina de obra"
],
"Material delivery today — keep the loading area free": [
"Сегодня доставка материалов — освободите зону разгрузки",
"Entrega de material hoy: mantengan libre la zona de carga"
],
"Power shutdown on this floor — check before you start": [
"Отключение питания на этаже — проверьте перед началом работ",
"Corte de energía en esta planta: verifique antes de empezar"
],
"Daily reports are due by 17:00": [
"Дневные отчёты — до 17:00",
"Los informes diarios vencen a las 17:00"
],
"Great work, team — milestone reached!": [
"Отличная работа, команда — этап пройден!",
"¡Gran trabajo, equipo: hito alcanzado!"
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
