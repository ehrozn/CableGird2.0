import json
# cable history from tasks, status without progress columns, take page stays on the list
T={
"Task": ["Задача", "Tarea"],
"Status changed": ["Статус изменён", "Estado cambiado"],
"Task taken": ["Задачу взяли", "Tarea tomada"],
"Task started": ["Задача начата", "Tarea iniciada"],
"Task done": ["Задача выполнена", "Tarea completada"],
"Task partly done": ["Задача выполнена частично", "Tarea completada en parte"],
"Task not done": ["Задача не выполнена", "Tarea no completada"],
"Task reopened": ["Задача снова открыта", "Tarea reabierta"],
"Status": ["Статус", "Estado"],
"Tap to change": ["Нажмите, чтобы изменить", "Toca para cambiar"],
"Status: {s}": ["Статус: {s}", "Estado: {s}"],
"Tasks update the status by themselves: taken → In progress, done → Complete. For detailed stages turn on “Progress” for a column in the registry.": ["Задачи сами меняют статус: взяли → «В процессе», выполнили → «Завершён». Для подробных этапов включите «Прогресс» у колонки в реестре.", "Las tareas actualizan el estado solas: tomada → «En curso», completada → «Completado». Para etapas detalladas activa «Progreso» en una columna del registro."],
"“{t}” is now with {c} — see My tasks": ["«{t}» теперь у группы {c} — смотрите «Мои задачи»", "«{t}» ahora es de {c}: mira «Mis tareas»"],
"Open": ["Открыть", "Abrir"],
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
