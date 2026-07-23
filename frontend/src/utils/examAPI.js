// frontend/src/utils/examAPI.js
// Advanced exam module API. Mounted separately from the original examAPI so
// existing exam screens keep working unchanged.
import api from './api';

export const examAdvAPI = {
  // Dashboard
  dashboard: () => api.get('/exams-adv/dashboard'),

  // Exam types
  getTypes:    ()          => api.get('/exams-adv/types'),
  createType:  (data)      => api.post('/exams-adv/types', data),
  updateType:  (id, data)  => api.put(`/exams-adv/types/${id}`, data),
  deleteType:  (id)        => api.delete(`/exams-adv/types/${id}`),

  // Grading schemes
  getSchemes:   ()         => api.get('/exams-adv/grading-schemes'),
  createScheme: (data)     => api.post('/exams-adv/grading-schemes', data),
  updateScheme: (id, data) => api.put(`/exams-adv/grading-schemes/${id}`, data),
  deleteScheme: (id)       => api.delete(`/exams-adv/grading-schemes/${id}`),

  // Exam groups
  getGroups:   (params)    => api.get('/exams-adv/groups', { params }),
  getGroup:    (id)        => api.get(`/exams-adv/groups/${id}`),
  createGroup: (data)      => api.post('/exams-adv/groups', data),
  updateGroup: (id, data)  => api.put(`/exams-adv/groups/${id}`, data),
  deleteGroup: (id)        => api.delete(`/exams-adv/groups/${id}`),

  // Subjects within an exam
  addSubject:    (groupId, data) => api.post(`/exams-adv/groups/${groupId}/subjects`, data),
  updateSubject: (id, data)      => api.put(`/exams-adv/subjects/${id}`, data),
  deleteSubject: (id)            => api.delete(`/exams-adv/subjects/${id}`),

  // Marks
  getMarks:  (subjectId)       => api.get(`/exams-adv/subjects/${subjectId}/marks`),
  saveMarks: (subjectId, data) => api.post(`/exams-adv/subjects/${subjectId}/marks`, data),

  // Results
  getResults: (groupId, params) => api.get(`/exams-adv/groups/${groupId}/results`, { params }),
  publish:    (groupId, publish) => api.put(`/exams-adv/groups/${groupId}/publish`, { publish }),
};

export default examAdvAPI;