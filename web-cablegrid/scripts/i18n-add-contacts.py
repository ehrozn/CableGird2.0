import json
# TV "Who to call"
T={
"Add contact": [
"Добавить контакт",
"Agregar contacto"
],
"Contact is on the TV": [
"Контакт на экране",
"El contacto está en la pantalla"
],
"Contact removed": [
"Контакт удалён",
"Contacto eliminado"
],
"Contact updated": [
"Контакт обновлён",
"Contacto actualizado"
],
"Emergency": [
"Экстренная служба",
"Emergencias"
],
"From the team": [
"Из команды",
"Del equipo"
],
"Names and phone numbers crews see on the TV. On the QR page they can call with one tap.": [
"Имена и телефоны, которые бригады видят на экране. На QR-странице можно позвонить в одно касание.",
"Nombres y teléfonos que las cuadrillas ven en la pantalla. En la página QR pueden llamar con un toque."
],
"No contacts yet — the manager adds them on the Board page": [
"Контактов пока нет — менеджер добавляет их на странице доски",
"Aún no hay contactos: el gerente los agrega en la página del tablero"
],
"No contacts yet. Add the foreman, the manager and an emergency number — crews will see them on the TV.": [
"Контактов пока нет. Добавьте прораба, менеджера и экстренный номер — бригады увидят их на экране.",
"Aún no hay contactos. Agregue al capataz, al gerente y un número de emergencia: las cuadrillas los verán en la pantalla."
],
"Note, e.g. 7:00–17:00 or room 210": [
"Заметка, например 7:00–17:00 или каб. 210",
"Nota, p. ej. 7:00–17:00 u oficina 210"
],
"Role on the screen (optional)": [
"Подпись роли на экране (необязательно)",
"Rol en la pantalla (opcional)"
],
"Safety officer": [
"Инженер по ТБ",
"Responsable de seguridad"
],
"Warehouse / materials": [
"Склад / материалы",
"Almacén / materiales"
],
"Who to call": [
"Кому звонить",
"A quién llamar"
],
"e.g. Emergency services": [
"например, Служба спасения",
"p. ej. Servicios de emergencia"
],
"Move up": [
"Выше",
"Subir"
],
"Move down": [
"Ниже",
"Bajar"
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
