import json
# several work schedules (one per group)
T={
"Duplicate": ["Дублировать", "Duplicar"],
"Add a group schedule": [
"Добавить график группы",
"Agregar horario de grupo"
],
"Crews on this schedule": [
"Бригады по этому графику",
"Cuadrillas con este horario"
],
"Group name, e.g. Crew A": [
"Название группы, например Бригада А",
"Nombre del grupo, p. ej. Cuadrilla A"
],
"Group {n}": [
"Группа {n}",
"Grupo {n}"
],
"Groups with different days or hours get their own schedule. Link crews so their QR page shows their schedule first.": [
"У групп с разными днями или часами — свой график. Привяжите бригады, чтобы на QR-странице их график был первым.",
"Los grupos con distintos días u horas tienen su propio horario. Vincule cuadrillas para que su página QR muestre primero su horario."
],
"New schedule added": [
"Новый график добавлен",
"Nuevo horario agregado"
],
"Now on: {name}": [
"Сейчас в графике: {name}",
"Ahora en: {name}"
],
"Pick the working days of this group": [
"Выберите рабочие дни этой группы",
"Elija los días laborables de este grupo"
],
"Schedule removed": [
"График удалён",
"Horario eliminado"
],
"Schedule {n}": [
"График {n}",
"Horario {n}"
],
"Your crew": [
"Ваша бригада",
"Su cuadrilla"
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
