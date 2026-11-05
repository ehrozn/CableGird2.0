import json
# Shared cable picker: search by ID / list / range, filters, Browse dialog.
T={
'+{n} more':('ещё +{n}','+{n} más'),
'Add cables to the report':('Добавить кабели в отчёт','Agregar cables al informe'),
'Add {n} cables':('Добавить кабели: {n}','Agregar {n} cables'),
'All lists':('Все списки','Todas las listas'),
'Attach cables':('Прикрепить кабели','Adjuntar cables'),
'Browse':('Выбрать','Explorar'),
'Browse with filters':('Выбрать с фильтрами','Explorar con filtros'),
'Cable list':('Список кабелей','Lista de cables'),
'Choose a cable':('Выберите кабель','Elija un cable'),
'Choose cables':('Выберите кабели','Elija cables'),
'Find a value…':('Найти значение…','Buscar un valor…'),
'Find cables':('Найти кабели','Buscar cables'),
'Find in the registry with filters':('Найти в реестре с фильтрами','Buscar en el registro con filtros'),
'ID, any value, a list of IDs or a range C-001..C-040':('ID, любое значение, список ID или диапазон C-001..C-040','ID, cualquier valor, una lista de ID o un rango C-001..C-040'),
'ID, value, list or range C-001..C-040':('ID, значение, список или диапазон C-001..C-040','ID, valor, lista o rango C-001..C-040'),
'Not in the registry':('Нет в реестре','No está en el registro'),
'Not in the registry — Enter adds “{id}” anyway':('Нет в реестре — Enter всё равно добавит «{id}»','No está en el registro: Enter agrega «{id}» de todos modos'),
'Range {r}: {n} cables':('Диапазон {r}: кабелей — {n}','Rango {r}: {n} cables'),
'Remove filter':('Убрать фильтр','Quitar filtro'),
'Search, paste a list of IDs or type a range. Narrow down with filters.':('Ищите, вставьте список ID или введите диапазон. Уточняйте фильтрами.','Busque, pegue una lista de ID o escriba un rango. Acote con filtros.'),
'Select all {n}':('Выбрать все: {n}','Seleccionar todos ({n})'),
'Selected only':('Только выбранные','Solo seleccionados'),
'Show all {n} in the list':('Показать все ({n}) в списке','Mostrar los {n} en la lista'),
'Show less':('Свернуть','Mostrar menos'),
'Show more ({n} left)':('Показать ещё (осталось {n})','Mostrar más (quedan {n})'),
'The registry is empty':('Реестр пуст','El registro está vacío'),
'Type an ID, paste a list or a range':('Введите ID, вставьте список или диапазон','Escriba un ID, pegue una lista o un rango'),
'Type an ID, paste a list or a range like C-001..C-040, or browse the registry with filters':('Введите ID, вставьте список или диапазон вида C-001..C-040 либо выберите в реестре с фильтрами','Escriba un ID, pegue una lista o un rango como C-001..C-040, o explore el registro con filtros'),
'Unselect these {n}':('Снять выбор с этих {n}','Deseleccionar estos {n}'),
'any':('любое','cualquiera'),
'{n} not in the registry':('нет в реестре: {n}','{n} no están en el registro'),
'{n} values':('значений: {n}','{n} valores'),
'{s}: done':('{s}: сделано','{s}: hecho'),
'{s}: not done':('{s}: не сделано','{s}: no hecho'),
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
