import json
T={
'Add all as new cables':('Добавить все как новые кабели','Agregar todos como cables nuevos'),
'Add existing cable':('Добавить существующий кабель','Agregar cable existente'),
'Add to report':('Добавить в отчёт','Agregar al informe'),
'Already done — marking it again counts as a repeat':('Уже выполнено — повторная отметка считается повтором','Ya hecho: marcarlo de nuevo cuenta como repetición'),
'Create as new cable':('Создать как новый кабель','Crear como cable nuevo'),
'Create new cable':('Создать новый кабель','Crear cable nuevo'),
'Done + date':('Отметка + дата','Hecho + fecha'),
'Find in registry':('Найти в реестре','Buscar en el registro'),
'Mark for all:':('Отметить у всех:','Marcar para todos:'),
'No cables in this report yet. Find them in the registry or create a new one.':('В отчёте пока нет кабелей. Найдите их в реестре или создайте новый.','Aún no hay cables en este informe. Búsquelos en el registro o cree uno nuevo.'),
'No progress columns yet':('Пока нет столбцов прогресса','Aún no hay columnas de progreso'),
'No stages yet. Turn on “Progress” for a column in the registry.':('Этапов пока нет. Включите «Прогресс» у столбца в реестре.','Aún no hay etapas. Active «Progreso» en una columna del registro.'),
'Not in registry: {ids}':('Нет в реестре: {ids}','No está en el registro: {ids}'),
'Pick a value to see its cables.':('Выберите значение, чтобы увидеть кабели.','Elija un valor para ver sus cables.'),
'Progress':('Прогресс','Progreso'),
'Progress column: crews mark it in reports with a date; it counts toward readiness.':('Столбец прогресса: бригады отмечают его в отчётах с датой, он учитывается в готовности.','Columna de progreso: las cuadrillas la marcan en los informes con fecha y cuenta para el avance.'),
'Stages are the progress columns of your registry. The weight sets how much each stage counts toward readiness.':('Этапы — это столбцы прогресса в реестре. Вес задаёт, насколько этап влияет на готовность.','Las etapas son las columnas de progreso del registro. El peso define cuánto cuenta cada etapa para el avance.'),
'Start typing — matching cables appear here.':('Начните вводить — подходящие кабели появятся здесь.','Empiece a escribir: los cables coincidentes aparecerán aquí.'),
'To add or rename a stage, edit the columns in the registry.':('Чтобы добавить или переименовать этап, измените столбцы в реестре.','Para agregar o renombrar una etapa, edite las columnas del registro.'),
'Turn on “Progress” for columns that track work (e.g. Pulled, Terminated, Tested): crews will see them in their reports.':('Включите «Прогресс» у столбцов, которые отслеживают работу (например, Протянут, Расшит, Протестирован): бригады увидят их в отчётах.','Active «Progreso» en las columnas que siguen el trabajo (p. ej., Tendido, Terminado, Probado): las cuadrillas las verán en sus informes.'),
'Type an ID or any value, or paste a list of IDs':('Введите ID или любое значение, либо вставьте список ID','Escriba un ID o cualquier valor, o pegue una lista de ID'),
'Work done':('Выполненная работа','Trabajo realizado'),
'{id} added to the report':('{id} добавлен в отчёт','{id} agregado al informe'),
'{id} already exists in the registry — it will be added as the existing cable.':('{id} уже есть в реестре — будет добавлен существующий кабель.','{id} ya existe en el registro: se agregará el cable existente.'),
'{id} is already in this report.':('{id} уже есть в этом отчёте.','{id} ya está en este informe.'),
}
f='src/lib/i18n-dict.ts'
s=open(f).read()
idx=[i for i in range(len(s)) if s.startswith('\n};',i)]
assert len(idx)>=2, idx
ru_end,es_end=idx[0],idx[1]
def block(k):
    return ''.join(f'\n  {json.dumps(key,ensure_ascii=False)}: {json.dumps(v[k],ensure_ascii=False)},' for key,v in T.items())
s=s[:es_end]+block(1)+s[es_end:]
s=s[:ru_end]+block(0)+s[ru_end:]
open(f,'w').write(s)
