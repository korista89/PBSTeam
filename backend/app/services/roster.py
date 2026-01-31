from typing import List, Dict

# School Structure Definition
# Kindergarten: 2 classes
# Elementary: 1-6 grades, 2 classes each (12 total)
# Middle: 1-3 grades, 2 classes each (6 total)
# High: 1-3 grades, 2 classes each (6 total)
# Major (Jeongong): 1-2 grades, 3 classes each (6 total)
# Total: 32 classes

def get_class_structure():
    structure = {
        "유치원": ["유치원 1반", "유치원 2반"],
        "초등학교": [f"초등 {g}학년 {c}반" for g in range(1, 7) for c in range(1, 3)],
        "중학교": [f"중등 {g}학년 {c}반" for g in range(1, 4) for c in range(1, 3)],
        "고등학교": [f"고등 {g}학년 {c}반" for g in range(1, 4) for c in range(1, 3)],
        "전공과": [f"전공 {g}학년 {c}반" for g in range(1, 3) for c in range(1, 4)]
    }
    return structure

def get_full_roster():
    # In a real app, this would merge the structure with student data from sheets
    # For now, returning the structure with empty student lists or mock counts
    structure = get_class_structure()
    
    # Flatten for easier consumption if needed, or keep hierarchical
    # Let's return hierarchical
    roster = []
    
    for section, classes in structure.items():
        section_data = {
            "section": section,
            "classes": []
        }
        for cls_name in classes:
            # Mock student count based on specs
            # Kindergarten: 4, Elem/Middle: 6, High/Major: 7
            count = 0
            if section == "유치원": count = 4
            elif section in ["초등학교", "중학교"]: count = 6
            else: count = 7
            
            section_data["classes"].append({
                "class_name": cls_name,
                "student_count": count,
                "students": [] # To be populated with real names
            })
        roster.append(section_data)
        
    return roster
